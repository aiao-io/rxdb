import { DiskBatchJournal, runDiskBatch } from './disk-batch';
import { DiskPath, TRASH, foldName, isWithin, parentOf, samePath, uniqueName } from './disk-path';
import { DiskError, DiskStore, nameTaken } from './disk-store';

/** 浏览器一次导入最多 256 MiB，读取本机文件之前先检查。 */
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

/** 导入大小必须可表示且总量不超出内存处理上限。 */
export function validateImportSize(sizes: readonly number[]): void {
  if (
    sizes.some(size => !Number.isSafeInteger(size) || size < 0) ||
    sizes.reduce((sum, size) => sum + size, 0) > MAX_IMPORT_BYTES
  )
    throw new Error('Import up to 256 MiB at a time. Choose a smaller batch of files.');
}

/** 一个待导入文件；读取本机文件由界面负责，磁盘操作只接收完整字节。 */
export interface ImportedFile {
  readonly name: string;
  readonly data: Uint8Array;
}

/** 文件名是一个路径段；不修剪或改写用户的有效名称。 */
export function validateName(name: string): string {
  const control = [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  if (!name.trim() || name === '.' || name === '..' || /[/\\]/.test(name) || control || name.length > 255)
    throw new DiskError(
      'EACCES',
      [name],
      'Enter a name of 1–255 characters without path separators or control characters.'
    );
  return name;
}

async function requireDirectory(store: DiskStore, path: DiskPath): Promise<void> {
  const kind = await store.kindOf(path);
  if (kind !== 'directory')
    throw new DiskError(
      kind ? 'ENOTDIR' : 'ENOENT',
      path,
      'The destination folder no longer exists. Choose another folder.'
    );
}

/** 改名不能覆盖已有目标；同名请求是一次不写入的成功。 */
export async function renameEntry(store: DiskStore, from: DiskPath, name: string): Promise<DiskPath> {
  const to = [...parentOf(from), validateName(name)];
  if (!(await store.kindOf(from))) throw new DiskError('ENOENT', from);
  if (!samePath(from, to)) await store.move(from, to);
  return to;
}

/** 改名撞名时的处理：`replace` 覆盖目标，`keepBoth` 自动追加序号，`reject` 抛现有 EEXIST 语义。 */
export type RenameConflictMode = 'replace' | 'keepBoth' | 'reject';

/** 同级已有只差大小写的名字：返回占着它的那条路径（精确大小写），没有为 `null`。 */
async function nameClash(store: DiskStore, dir: DiskPath, name: string): Promise<DiskPath | null> {
  const folded = foldName(name);
  const entry = (await store.list(dir)).find(item => foldName(item.name) === folded);
  return entry ? [...dir, entry.name] : null;
}

/**
 * 改名并处理重名。`reject` 与 {@link renameEntry} 同语义（抛 EEXIST，两个条目都不动）；
 * `replace` 删除目标后用新名字落地（覆盖模式删掉了原目标，调用方不要把它压进撤销栈）；
 * `keepBoth` 保留双方，新名字追加序号（`note.txt` → `note 2.txt`）。改成自己只差大小写的名字不算撞名。
 */
export async function renameWithConflict(
  store: DiskStore,
  from: DiskPath,
  name: string,
  mode: RenameConflictMode
): Promise<DiskPath> {
  const to = [...parentOf(from), validateName(name)];
  if (!(await store.kindOf(from))) throw new DiskError('ENOENT', from);
  if (samePath(from, to)) return to;
  const clash = await nameClash(store, parentOf(from), name);
  if (!clash || samePath(clash, from)) {
    await store.move(from, to);
    return to;
  }
  if (mode === 'reject') throw nameTaken(to, clash.at(-1) ?? name);
  if (mode === 'replace') {
    await store.remove(clash);
    await store.move(from, to);
    return to;
  }
  const target = [
    ...parentOf(from),
    uniqueName(
      (await store.list(parentOf(from))).map(item => item.name),
      name
    )
  ];
  await store.move(from, target);
  return target;
}

/** 按精确路径深复制（不消重名、不走批次日志）：撤销栈的重做与冲突覆盖用。 */
export async function copyEntryToPath(store: DiskStore, from: DiskPath, to: DiskPath): Promise<void> {
  if (await store.kindOf(to)) throw nameTaken(to, to.at(-1) ?? '');
  if (!(await store.kindOf(from))) throw new DiskError('ENOENT', from);
  await copyTree(store, from, to);
}

/** 撤销栈里的一条命令：记录正向动作，undo/redo 各执行一次反向/正向动作并返回实际改动的路径。 */
export interface FileCommand {
  readonly kind: 'rename' | 'move' | 'copy' | 'duplicate' | 'newFolder' | 'trash';
  /** 菜单里显示的动作名（Rename、Move to Trash…）。 */
  readonly label: string;
  /** 撤销或重做之后要通知的路径。 */
  readonly paths: readonly DiskPath[];
  /** 还剩多少个子动作没还原（废纸篓批次用）；没有就是单条命令。 */
  readonly pending?: () => number;
  /** 撤销成功的收尾（标签键迁移等），在磁盘锁外执行，失败不打断。 */
  readonly afterUndo?: () => Promise<void>;
  /** 重做成功的收尾，在磁盘锁外执行，失败不打断。 */
  readonly afterRedo?: () => Promise<void>;
  undo(store: DiskStore): Promise<readonly DiskPath[]>;
  redo(store: DiskStore): Promise<readonly DiskPath[]>;
}

/** 命令栈上限：与旧废纸篓撤销一致，超了丢最早的。 */
export const OPERATION_UNDO_LIMIT = 50;

/**
 * 统一撤销/重做栈：只记本标签页的操作（跨页不共享）。压入新命令清空重做栈；
 * 反向动作失败时命令留在栈里、错误抛给调用方。
 */
export class OperationHistory {
  private readonly done: FileCommand[] = [];
  private readonly undone: FileCommand[] = [];

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  constructor(private readonly limit = OPERATION_UNDO_LIMIT) {}

  /** 最近一条命令的动作名；没有可撤销的命令时为 `null`。 */
  label(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  push(command: FileCommand): void {
    this.done.push(command);
    if (this.done.length > this.limit) this.done.shift();
    this.undone.length = 0;
  }

  /** 还有没有废纸篓命令可撤销（canUndoTrash 的口径）。 */
  hasTrash(): boolean {
    return this.done.some(command => command.kind === 'trash');
  }

  /** 最近一条废纸篓命令；undoTrash 据此撤销，不受夹在中间的其他命令影响。 */
  mostRecentTrash(): FileCommand | null {
    for (let index = this.done.length - 1; index >= 0; index--)
      if (this.done[index].kind === 'trash') return this.done[index];
    return null;
  }

  /** 清空废纸篓之后调用：两条栈里的废纸篓命令都失效了。 */
  removeTrash(): void {
    this.removeWhere(command => command.kind === 'trash');
  }

  clear(): void {
    this.done.length = 0;
    this.undone.length = 0;
  }

  /** 撤销最近一条命令并把它移进重做栈；反向动作失败时命令留在栈里，错误抛给调用方。 */
  async undo(store: DiskStore): Promise<FileCommand | null> {
    const command = this.done.at(-1);
    if (!command) return null;
    await command.undo(store);
    this.done.pop();
    this.undone.push(command);
    if (this.undone.length > this.limit) this.undone.shift();
    return command;
  }

  /** 重做最近一次撤销并把它移回撤销栈；重放失败时命令留在重做栈里，错误抛给调用方。 */
  async redo(store: DiskStore): Promise<FileCommand | null> {
    const command = this.undone.at(-1);
    if (!command) return null;
    await command.redo(store);
    this.undone.pop();
    this.done.push(command);
    if (this.done.length > this.limit) this.done.shift();
    return command;
  }

  /** 从两条栈里去掉一条命令（撤销中间的废纸篓命令时用）。 */
  remove(command: FileCommand): void {
    this.removeWhere(other => other === command);
  }

  private removeWhere(predicate: (command: FileCommand) => boolean): void {
    const keep = (commands: FileCommand[]): void => {
      for (let index = commands.length - 1; index >= 0; index--)
        if (predicate(commands[index])) commands.splice(index, 1);
    };
    keep(this.done);
    keep(this.undone);
  }
}

async function unusedPath(store: DiskStore, dir: DiskPath, name: string): Promise<DiskPath> {
  await requireDirectory(store, dir);
  return [
    ...dir,
    uniqueName(
      (await store.list(dir)).map(item => item.name),
      name
    )
  ];
}

async function targetPath(store: DiskStore, from: DiskPath, dir: DiskPath): Promise<DiskPath> {
  if (!from.length) throw new DiskError('EACCES', from, 'The volume root cannot be copied or moved.');
  if (isWithin(dir, from)) throw new DiskError('EACCES', dir, 'An item cannot be copied or moved into itself.');
  if (!(await store.kindOf(from))) throw new DiskError('ENOENT', from);
  return unusedPath(store, dir, from.at(-1) ?? '');
}

async function copyTree(store: DiskStore, from: DiskPath, to: DiskPath): Promise<void> {
  const pending = [{ from, to }];
  while (pending.length) {
    const entry = pending.pop()!;
    const kind = await store.kindOf(entry.from);
    if (!kind) throw new DiskError('ENOENT', entry.from);
    if (kind === 'file') await store.write(entry.to, await store.read(entry.from));
    else {
      await store.mkdir(entry.to);
      pending.push(
        ...(await store.list(entry.from)).map(child => ({
          from: [...entry.from, child.name],
          to: [...entry.to, child.name]
        }))
      );
    }
  }
}

/** 深复制目录与文件，失败撤回本次创建的目标。调用者持有整次操作的磁盘锁。 */
export async function duplicateEntry(store: DiskStore, from: DiskPath, journal: DiskBatchJournal): Promise<DiskPath> {
  const name = validateName(from.at(-1) ?? '');
  const dot = name.lastIndexOf('.');
  const copy = dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
  const to = await unusedPath(store, parentOf(from), copy);
  await runDiskBatch(store, journal, [to], () => copyTree(store, from, to));
  return to;
}

/** 复制文件或文件夹到另一个目录，目标重名时保留源名称并追加序号。 */
export async function copyEntryTo(
  store: DiskStore,
  from: DiskPath,
  dir: DiskPath,
  journal: DiskBatchJournal
): Promise<DiskPath> {
  const to = await targetPath(store, from, dir);
  await runDiskBatch(store, journal, [to], () => copyTree(store, from, to));
  return to;
}

/** 移动文件或文件夹到另一个目录，目标重名时保留源内容并追加序号。 */
export async function moveEntryTo(store: DiskStore, from: DiskPath, dir: DiskPath): Promise<DiskPath> {
  if (samePath(parentOf(from), dir)) return from;
  const to = await targetPath(store, from, dir);
  await store.move(from, to);
  return to;
}

/** 整批预检、导入与重名消解；失败只撤回本批目标，不改已有内容。 */
export async function importFiles(
  store: DiskStore,
  dir: DiskPath,
  files: readonly ImportedFile[],
  journal: DiskBatchJournal
): Promise<DiskPath[]> {
  files.forEach(file => validateName(file.name));
  validateImportSize(files.map(file => file.data.byteLength));
  await requireDirectory(store, dir);
  const names = (await store.list(dir)).map(item => item.name);
  const targets = files.map(file => {
    const name = uniqueName(names, file.name);
    names.push(name);
    return [...dir, name];
  });
  if (!targets.length) return [];
  await runDiskBatch(store, journal, targets, async () => {
    for (const [index, file] of files.entries()) await store.write(targets[index], file.data);
  });
  return targets;
}

/** 恢复顶层废纸篓条目；原目录失效或旧条目没有原位置时要求用户选择目录。 */
export async function restoreEntry(store: DiskStore, from: DiskPath, destination?: DiskPath): Promise<DiskPath> {
  if (!samePath(parentOf(from), TRASH))
    throw new DiskError('EACCES', from, 'Select an item directly inside the Trash.');
  const entry = (await store.list(TRASH)).find(item => item.name === from.at(-1));
  if (!entry) throw new DiskError('ENOENT', from);
  const original = entry.originalPath;
  if (original) original.forEach(validateName);
  if (!original?.length && !destination)
    throw new DiskError('ENOENT', from, 'The original location is unknown. Choose Restore to Folder.');
  const dir = destination ?? parentOf(original!);
  if (isWithin(dir, TRASH)) throw new DiskError('EACCES', dir, 'Choose a folder outside the Trash.');
  const name = validateName(original?.at(-1) ?? entry.name);
  const to = await unusedPath(store, dir, name);
  await store.move(from, to);
  return to;
}

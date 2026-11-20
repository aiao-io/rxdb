import { DiskBatchJournal, runDiskBatch } from './disk-batch';
import { DiskPath, TRASH, isWithin, parentOf, samePath, uniqueName } from './disk-path';
import { DiskError, DiskStore } from './disk-store';

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

async function unusedPath(store: DiskStore, dir: DiskPath, name: string): Promise<DiskPath> {
  await requireDirectory(store, dir);
  return [...dir, uniqueName((await store.list(dir)).map(item => item.name), name)];
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

import {
  DestroyRef,
  EnvironmentInjector,
  ErrorHandler,
  Service,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, auditTime } from 'rxjs';

import { ApprovedRelease } from '../data/approved-catalog';
import { DesktopData, keyIs } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { makeAlias as makeAliasEntry, resolveAlias } from '../disk/alias';
import {
  APPLICATION_JOURNAL_KEY,
  ApplicationJournal,
  prepareApplicationChange,
  recoverApplicationChange
} from '../disk/application-journal';
import { DesktopFile } from '../disk/desktop-file.entity';
import { DiskBatchJournal, DiskBatchRecord, recoverDiskBatch } from '../disk/disk-batch';
import {
  DESKTOP,
  DISK_ROOTS,
  DiskPath,
  HOME,
  TRASH,
  VOLUME_NAME,
  finderPathOf,
  isRequiredDiskPath,
  isWithin,
  parentOf,
  samePath,
  uniqueName
} from '../disk/disk-path';
import { buildSeed, writeSeed } from '../disk/disk-seed';
import { DiskError, DiskStore } from '../disk/disk-store';
import { FileRow, FsNode, buildTree, emptyVolume, nodeAt as findNode, searchNodes } from '../disk/disk-tree';
import { DiskMarker, DiskSeeder, DiskVolume, eraseVolume, openVolume } from '../disk/disk-volume';
import {
  FileCommand,
  ImportedFile,
  OperationHistory,
  RenameConflictMode,
  copyEntryTo,
  copyEntryToPath,
  duplicateEntry,
  importFiles as importEntries,
  moveEntryTo,
  renameWithConflict,
  restoreEntry
} from '../disk/file-operations';
import { ProtectedDiskStore } from '../disk/protected-store';
import { BLOB_DIR, RxdbDiskStore } from '../disk/rxdb-disk-store';
import { TAGS_KEY, TagColor, TagsMap, tagsOf as diskTagsOf, migrateTags, parseTagsMap, withTags } from '../disk/tags';
import { compressToZipFile as writeZipTo } from '../disk/zip';
import { USER_PROFILE } from '../shared/user-profile';
import { ApplicationCatalog } from './application-catalog';
import { ApplicationRegistry } from './application-registry';
import { ImageThumbnailCache } from './image-thumbnail-cache';
import { InstalledApplications } from './installed-applications';

export type { FsNode } from '../disk/disk-tree';

export type DiskState = 'mounting' | 'ready' | 'failed';

export interface DiskChange {
  readonly paths: readonly DiskPath[];
  readonly source: 'desktop' | 'terminal';
}

interface TrashMove {
  readonly id: DesktopFile['id'];
  readonly original: DiskPath;
  readonly target: DiskPath;
}

/** Finder 侧栏与「前往」菜单的快捷位置；`null` 表示虚拟视图。 */
export const PLACES: Readonly<Record<string, readonly string[] | null>> = {
  AirDrop: null,
  Recents: null,
  Desktop: finderPathOf(DESKTOP),
  Documents: finderPathOf([...HOME, 'Documents']),
  Downloads: finderPathOf([...HOME, 'Downloads']),
  Movies: finderPathOf([...HOME, 'Movies']),
  Music: finderPathOf([...HOME, 'Music']),
  Pictures: finderPathOf([...HOME, 'Pictures']),
  Applications: finderPathOf(['Applications']),
  [USER_PROFILE.name]: finderPathOf(HOME),
  'Macintosh HD': [VOLUME_NAME],
  Trash: finderPathOf(TRASH)
};

/** 用户主目录，桌面启动时 Finder 默认打开这里。 */
export const HOME_PATH: readonly string[] = finderPathOf(HOME);

/** 「最近使用」的初始内容；之后打开过的文件排到最前面，存在系统偏好里。 */
const RECENT_SEED: readonly DiskPath[] = [
  [...DESKTOP, 'Projects', 'desktop-web', 'index.html'],
  [...DESKTOP, 'prasenx.txt'],
  [...HOME, 'Documents', 'Writing', 'on-restraint.md'],
  [...HOME, 'Downloads', 'render-final.mp4'],
  [...DESKTOP, 'Interface Guidelines.pdf']
];
const RECENTS_KEY = 'finder:recents';
const DISK_MARKER_KEY = 'seed:disk';

/** 卷根与 System 里不能新建东西；保存面板也据此禁用这些位置。 */
export const isLocked = (dir: DiskPath): boolean => dir.length === 0 || dir[0] === 'System';

const ALL = { combinator: 'and' as const, rules: [] };

const isPathList = (value: unknown): value is string[][] =>
  Array.isArray(value) && value.every(path => Array.isArray(path) && path.every(part => typeof part === 'string'));

const isMarker = (value: unknown): value is DiskMarker =>
  typeof (value as DiskMarker | null)?.version === 'number' && typeof (value as DiskMarker).seededAt === 'number';

/** {@link parseTagsMap} 的守卫形式：偏好读写要 `(value: unknown) => value is T`，校验口径不变。 */
const isTagsMap = (value: unknown): value is TagsMap => parseTagsMap(value) !== null;

const toRow = (file: DesktopFile): FileRow => ({
  id: file.id,
  parentId: file.parentId ?? null,
  name: file.name,
  folder: file.type === 'folder',
  size: file.size,
  modified: file.modifiedAt,
  contentId: file.contentId
});

const encoder = new TextEncoder();

/** 给界面用的错误文字：磁盘错误自带 Finder 风格的说明。 */
export const describeDiskError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Macintosh HD：目录树与元数据是本地 SQLite 里的 `DesktopFile` 行，文件体由 storage 插件放在 OPFS。
 * 首次打开时复制内置内容，之后保留所有改动。
 *
 * 同一个来源的多个标签页共用这块磁盘（ADESK-US-105）：每次磁盘操作（读也一样）都在跨标签页的独占锁里、
 * 先对一遍库再执行，所以两个标签页不会交错，也不会拿过期的内存索引去写；写盘之后广播通知，
 * 别的标签页据此丢掉索引。界面读的那棵树由活查询组装，谁改了文件行（Finder、TextEdit、终端同步或别的标签页），
 * Finder、桌面与 Dock 都跟着更新；页面从后台回到前台时再整树重读一次，补上任何漏掉的变化。
 */
@Service({ autoProvided: false })
export class FileSystem {
  private readonly installed = inject(InstalledApplications);
  private readonly registry = inject(ApplicationRegistry);
  private readonly data = inject(DesktopData);
  private readonly preferences = inject(Preferences);
  private readonly injector = inject(EnvironmentInjector);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly thumbnails = inject(ImageThumbnailCache);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(ErrorHandler);
  private readonly rootState = signal<FsNode>(emptyVolume());
  private readonly stateValue = signal<DiskState>('mounting');
  private readonly errorValue = signal<string | null>(null);
  private store: RxdbDiskStore | null = null;
  private guardedStore: ProtectedDiskStore | null = null;
  private volume: DiskVolume | null = null;
  private marker: DiskMarker | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** 活查询发出过多少次结果；回到前台重读目录树时，靠它判断读的期间有没有更新的结果到达。 */
  private treeSeq = 0;
  private applicationSignature = '';
  private readonly mounted: Promise<void>;
  private readonly diskChanges = new Subject<DiskChange>();
  private readonly history = new OperationHistory();
  private readonly historyVersion = signal(0);
  private readonly pendingTrashMoves = signal(0);

  readonly root = this.rootState.asReadonly();
  readonly state = this.stateValue.asReadonly();
  readonly error = this.errorValue.asReadonly();
  /** 废纸篓里有东西时 Dock 显示满的图标。 */
  readonly trashFull = computed(() => (findNode(this.rootState(), TRASH)?.children?.length ?? 0) > 0);
  /** 撤销栈的通用口径：改名、移动、复制、新建文件夹与废纸篓都在里面。 */
  readonly canUndo = computed(() => {
    this.historyVersion();
    return this.history.canUndo;
  });
  /** 重做栈有没有东西。 */
  readonly canRedo = computed(() => {
    this.historyVersion();
    return this.history.canRedo;
  });
  /** 最近一条可撤销命令的动作名（Rename、Move to Trash…）；没有时为 `null`。 */
  readonly undoLabel = computed(() => {
    this.historyVersion();
    return this.history.label();
  });
  /** 废纸篓口径（旧入口的别名）：废纸篓命令还在、或正在移入废纸篓。 */
  readonly canUndoTrash = computed(() => {
    this.historyVersion();
    return this.pendingTrashMoves() > 0 || this.history.hasTrash();
  });
  /** 本标签页磁盘改动的路径与来源；终端只同步来自桌面的改动。 */
  readonly changes = this.diskChanges.asObservable();

  constructor() {
    this.mounted = this.mount();
    effect(() => {
      this.registry.apps();
      untracked(() => {
        if (this.stateValue() === 'ready')
          void this.exclusive(async () => undefined).catch((error: unknown) => this.fail(error));
      });
    });
    const tabs = this.data.tabs;
    /* 别的标签页写了磁盘：下一次磁盘操作之前重读内存索引。回到前台：整树重读，索引同样重读。 */
    tabs
      .changes('disk')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.store?.markStale());
    tabs.resumed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.store?.markStale();
      this.reloadTree().catch((error: unknown) => this.fail(error));
    });
  }

  /** 挂载结束（成功或失败）时完成；之后看 `state()`。 */
  whenReady(): Promise<void> {
    return this.mounted;
  }

  nodeAt(path: DiskPath): FsNode | null {
    return findNode(this.rootState(), path);
  }

  /** 按 Finder 路径取节点：`['Macintosh HD', …]` 或 `['Trash', …]`。 */
  get(finderPath: readonly string[]): FsNode | null {
    if (finderPath[0] === VOLUME_NAME) return this.nodeAt(finderPath.slice(1));
    if (finderPath[0] === 'Trash') return this.nodeAt([...TRASH, ...finderPath.slice(1)]);
    return null;
  }

  recents(): FsNode[] {
    return (this.preferences.get(RECENTS_KEY, isPathList) ?? RECENT_SEED)
      .map(path => this.nodeAt(path))
      .filter((node): node is FsNode => node?.kind === 'file');
  }

  deepSearch(node: FsNode | null, query: string): FsNode[] {
    return searchNodes(node, query);
  }

  findPath(node: FsNode): readonly string[] | null {
    return node.path ? finderPathOf(node.path) : null;
  }

  noteOpened(path: DiskPath): void {
    const recent = this.preferences.get(RECENTS_KEY, isPathList) ?? RECENT_SEED;
    const next = [path, ...recent.filter(other => !samePath(other, path))].slice(0, 20);
    this.preferences.set(RECENTS_KEY, next).catch((error: unknown) => this.errors.handleError(error));
  }

  /** 在目录里新建「untitled folder」，重名时追加序号；返回新名字。 */
  async newFolder(dir: DiskPath): Promise<string> {
    if (isLocked(dir))
      throw new DiskError(
        'EACCES',
        dir,
        'The folder “untitled folder” can’t be created because you don’t have permission.'
      );
    const name = await this.exclusive(async store => {
      const folder = uniqueName(
        (await store.list(dir)).map(entry => entry.name),
        'untitled folder'
      );
      await store.mkdir([...dir, folder]);
      return folder;
    });
    const path = [...dir, name];
    this.pushCommand({
      kind: 'newFolder',
      label: 'New Folder',
      paths: [path],
      undo: async store => {
        if ((await store.kindOf(path)) !== 'directory') return [];
        if ((await store.list(path)).length) return [];
        await store.remove(path);
        return [path];
      },
      redo: async store => {
        await store.mkdir(path);
        return [path];
      }
    });
    this.notifyChanges([path]);
    return name;
  }

  async moveToTrash(path: DiskPath): Promise<void> {
    await this.moveToTrashBatch([path]);
  }

  /** 一次操作移进 `~/.Trash` 的条目作为一批撤销；只记录实际移走的文件。 */
  async moveToTrashBatch(paths: readonly DiskPath[]): Promise<void> {
    if (!paths.length) return;
    const moved: TrashMove[] = [];
    this.pendingTrashMoves.update(count => count + 1);
    try {
      await this.exclusive(async store => {
        try {
          for (const path of paths) moved.push(await this.trashEntry(store, path));
        } finally {
          if (moved.length) this.pushCommand(this.trashCommand(moved));
        }
      });
    } finally {
      this.pendingTrashMoves.update(count => count - 1);
      if (moved.length) this.notifyChanges(moved.flatMap(({ original, target }) => [original, target]));
    }
  }

  /** 撤销最近一条文件操作（改名、移动、复制、新建文件夹、废纸篓）；反向动作失败时命令保留、错误原样抛出。 */
  async undo(): Promise<void> {
    const command = await this.exclusive(store => this.history.undo(store));
    if (!command) return;
    this.historyVersion.update(version => version + 1);
    await this.afterHistory(command.afterUndo);
    this.notifyChanges(command.paths);
  }

  /** 重做最近一次撤销；重放失败时命令留在重做栈里、错误原样抛出。 */
  async redo(): Promise<void> {
    const command = await this.exclusive(store => this.history.redo(store));
    if (!command) return;
    this.historyVersion.update(version => version + 1);
    await this.afterHistory(command.afterRedo);
    this.notifyChanges(command.paths);
  }

  /**
   * 撤销最近一次移进废纸篓（旧入口的别名，行为与并入命令栈前一致）：只认废纸篓命令，
   * 不受夹在中间的其他命令影响；一条都没还原成时（比如条目已不在废纸篓）命令保留。
   */
  async undoTrash(): Promise<void> {
    const undone = await this.exclusive(async store => {
      const found = this.history.mostRecentTrash();
      if (!found) return null;
      const changed = await found.undo(store);
      if (changed.length && !found.pending?.()) {
        this.history.remove(found);
        this.historyVersion.update(version => version + 1);
      }
      return changed.length ? { command: found, changed } : null;
    });
    if (!undone) return;
    await this.afterHistory(undone.command.afterUndo);
    this.notifyChanges(undone.changed);
  }

  /** Finder 改名：系统目录与预装应用的保护同样适用；撞名抛 EEXIST。 */
  async rename(path: DiskPath, name: string): Promise<DiskPath> {
    return this.renameWith(path, name, 'reject');
  }

  /**
   * Finder 改名，带重名处理：`replace` 覆盖目标（不记撤销），`keepBoth` 自动追加序号，`reject` 抛现有 EEXIST 语义。
   * 改名与撤销都会把 `finder:tags` 的标签键迁到新路径。
   */
  async renameWith(path: DiskPath, name: string, mode: RenameConflictMode): Promise<DiskPath> {
    if (isRequiredDiskPath(path))
      throw new DiskError('EACCES', path, 'This item is required by the system and cannot be renamed.');
    const target = await this.exclusive(store => renameWithConflict(store, path, name, mode));
    if (mode !== 'replace' && !samePath(path, target)) this.pushRenameCommand(path, target);
    this.migrateTagsFor(path, target);
    this.notifyChanges([path, target]);
    return target;
  }

  async duplicate(path: DiskPath): Promise<DiskPath> {
    this.requireWritable(parentOf(path));
    const target = await this.exclusive(store => duplicateEntry(store, path, this.batchJournal()));
    this.pushCommand(this.copyCommand('duplicate', 'Duplicate', path, target));
    this.notifyChanges([target]);
    return target;
  }

  async copyTo(path: DiskPath, dir: DiskPath): Promise<DiskPath> {
    this.requireWritable(dir);
    const target = await this.exclusive(store => copyEntryTo(store, path, dir, this.batchJournal()));
    this.pushCommand(this.copyCommand('copy', 'Copy', path, target));
    this.notifyChanges([target]);
    return target;
  }

  async moveTo(path: DiskPath, dir: DiskPath): Promise<DiskPath> {
    if (isRequiredDiskPath(path))
      throw new DiskError('EACCES', path, 'This item is required by the system and cannot be moved.');
    this.requireWritable(parentOf(path));
    this.requireWritable(dir);
    const target = await this.exclusive(store => moveEntryTo(store, path, dir));
    if (!samePath(path, target)) {
      this.pushMoveCommand(path, target);
      this.migrateTagsFor(path, target);
    }
    this.notifyChanges([path, target]);
    return target;
  }

  async importFiles(dir: DiskPath, files: readonly ImportedFile[]): Promise<DiskPath[]> {
    this.requireWritable(dir);
    const targets = await this.exclusive(store => importEntries(store, dir, files, this.batchJournal()));
    this.notifyChanges(targets);
    return targets;
  }

  async restore(path: DiskPath, dir?: DiskPath): Promise<DiskPath> {
    const target = await this.exclusive(async store => {
      const original = (await store.list(TRASH)).find(entry => entry.name === path.at(-1))?.originalPath;
      if (dir ?? original) this.requireWritable(dir ?? parentOf(original!));
      return restoreEntry(store, path, dir);
    });
    this.notifyChanges([path, target]);
    return target;
  }

  /** 在条目旁边生成别名文件（`<名字> alias`），返回别名路径。 */
  async makeAlias(path: DiskPath): Promise<DiskPath> {
    const target = await this.exclusive(store => makeAliasEntry(store, path));
    this.notifyChanges([target]);
    return target;
  }

  /** 解析别名指向的条目：不是别名、别名损坏或目标已不存在时为 `null`。 */
  async aliasTarget(node: FsNode): Promise<FsNode | null> {
    if (!node.path) return null;
    return this.exclusive(store => resolveAlias(store, node));
  }

  /** 设置一个路径的 Finder 标签（空数组清除）；存进 `finder:tags` 偏好。 */
  async setTags(path: DiskPath, colors: readonly TagColor[]): Promise<void> {
    await this.preferences.update(TAGS_KEY, isTagsMap, current => withTags(current ?? {}, path, colors));
  }

  /** 一个条目当前的标签颜色；没有标签时为 `[]`。 */
  tagsOf(node: FsNode): readonly TagColor[] {
    return diskTagsOf(this.preferences.get(TAGS_KEY, isTagsMap) ?? {}, node);
  }

  /** 把一组条目打成 ZIP 写进目录（归档与同级重名时追加序号），返回落盘路径。 */
  async compressToZip(paths: readonly DiskPath[], dir: DiskPath): Promise<DiskPath> {
    const target = await this.exclusive(store => writeZipTo(store, paths, dir));
    this.notifyChanges([target]);
    return target;
  }

  async emptyTrash(): Promise<void> {
    const removed = await this.exclusive(async store => {
      const entries = (await store.kindOf(TRASH)) === 'directory' ? await store.list(TRASH) : [];
      for (const entry of entries) await store.remove([...TRASH, entry.name]);
      this.history.removeTrash();
      this.historyVersion.update(version => version + 1);
      return entries.map(entry => [...TRASH, entry.name]);
    });
    this.notifyChanges(removed);
  }

  read(path: DiskPath): Promise<Uint8Array> {
    return this.exclusive(store => store.read(path));
  }

  async readText(path: DiskPath): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }

  /** 写入文本：路径不存在就创建它与缺失的父目录，已有文件就覆盖。这是显式的新建入口（另存、导入），保存已打开的文件用 {@link saveText}。 */
  async writeText(path: DiskPath, text: string): Promise<void> {
    await this.exclusive(store => store.write(path, encoder.encode(text)));
    this.notifyChanges([path]);
  }

  /**
   * 保存一个已打开的文件（TextEdit 的 ⌘S）：只覆盖已存在的文件。保存时目标已被别的标签页删除、移进废纸篓、改名或抹掉，
   * 就失败并说明原因（编辑内容留在调用方的窗口里），不在原路径悄悄新建。两个标签页都保存时后提交的内容生效，不合并、不提示冲突。
   */
  async saveText(path: DiskPath, text: string): Promise<void> {
    const name = path.at(-1) ?? VOLUME_NAME;
    try {
      await this.exclusive(store => store.replace(path, encoder.encode(text)));
    } catch (error) {
      if (error instanceof DiskError && error.code === 'ENOENT')
        throw new DiskError(
          'ENOENT',
          path,
          `“${name}” can’t be saved because it was moved, renamed or deleted. Your changes are still in this window.`
        );
      if (error instanceof DiskError && error.code === 'EISDIR')
        throw new DiskError(
          'EISDIR',
          path,
          `“${name}” can’t be saved because a folder with that name is there now. Your changes are still in this window.`
        );
      throw error;
    }
    this.notifyChanges([path]);
  }

  /** 投影日志先落库，再提交安装状态；中断后按已提交状态恢复系统文件。 */
  async projectApplications(releases: readonly ApprovedRelease[], commit: () => Promise<void>): Promise<void> {
    await this.exclusive(async () => {
      const before = this.registry.apps();
      const after = this.registry.definitionsFor(releases);
      const store = this.mountedRawStore();
      const journal = this.applicationJournal();
      await prepareApplicationChange(store, journal, before, after);
      try {
        await this.catalog.reconcile(store, after);
        await commit();
        await journal.clear();
      } catch (error) {
        try {
          await this.reconcileCurrent(store);
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            'Application files need recovery. Reload the desktop before retrying.',
            { cause: cleanup }
          );
        }
        throw error;
      }
    });
  }

  /** 抹掉整块磁盘并恢复内置内容（磁盘工具的「抹掉」）。 */
  async erase(): Promise<void> {
    await this.exclusive(async () => {
      this.marker = await eraseVolume(this.mountedVolume(), this.seeder(), Date.now);
      this.history.clear();
      this.historyVersion.update(version => version + 1);
      /* 抹掉后由应用清单重新生成 /Applications 里的预装包（D-17）。 */
      await this.catalog.reconcile(this.mountedRawStore());
    });
    this.notifyChanges(DISK_ROOTS.map(root => [root]));
  }

  /** 直接用 `run` 写盘的调用方在提交后通知本标签页的应用。 */
  notifyChanges(paths: readonly DiskPath[], source: DiskChange['source'] = 'desktop'): void {
    this.diskChanges.next({ paths, source });
  }

  /** 给终端的虚拟机同步用：在同一条串行队列里直接读写存储后端。 */
  run<T>(task: (store: DiskStore) => Promise<T>): Promise<T> {
    return this.exclusive(task);
  }

  private async trashEntry(store: DiskStore, path: DiskPath): Promise<TrashMove> {
    const name = path.at(-1) ?? VOLUME_NAME;
    if (isRequiredDiskPath(path))
      throw new DiskError(
        'EACCES',
        path,
        `The item “${name}” can’t be moved to the Trash because it’s required by macOS.`
      );
    if (isWithin(path, TRASH)) throw new DiskError('EEXIST', path, `“${name}” is already in the Trash.`);
    const violation = this.catalog.violation({ kind: 'move', from: path, to: [...TRASH, name] });
    if (violation)
      throw new DiskError('EACCES', path, violation.replace('can’t be moved', 'can’t be moved to the Trash'));
    const id = await this.mountedRawStore().idAt(path);
    if (!id)
      throw new DiskError(
        'ENOENT',
        path,
        `The item “${name}” can’t be moved to the Trash because it no longer exists.`
      );
    await store.mkdir(TRASH);
    const names = (await store.list(TRASH)).map(entry => entry.name);
    const target = [...TRASH, uniqueName(names, name)];
    await store.move(path, target);
    return { id, original: [...path], target };
  }

  private requireWritable(dir: DiskPath): void {
    if (isLocked(dir)) throw new DiskError('EACCES', dir, 'You do not have permission to change this folder.');
  }

  /** 压一条命令进撤销栈并叫醒 canUndo/canRedo/undoLabel 等信号。 */
  private pushCommand(command: FileCommand): void {
    this.history.push(command);
    this.historyVersion.update(version => version + 1);
  }

  private pushRenameCommand(from: DiskPath, to: DiskPath): void {
    this.pushCommand({
      kind: 'rename',
      label: 'Rename',
      paths: [from, to],
      undo: async store => {
        if (!(await store.kindOf(to))) throw new DiskError('ENOENT', to);
        await store.move(to, from);
        return [to, from];
      },
      redo: async store => {
        if (!(await store.kindOf(from))) throw new DiskError('ENOENT', from);
        await store.move(from, to);
        return [from, to];
      },
      afterUndo: async () => this.migrateTagsFor(to, from),
      afterRedo: async () => this.migrateTagsFor(from, to)
    });
  }

  private pushMoveCommand(from: DiskPath, to: DiskPath): void {
    this.pushCommand({
      kind: 'move',
      label: 'Move',
      paths: [from, to],
      undo: async store => {
        await store.move(to, from);
        return [to, from];
      },
      redo: async store => {
        await store.move(from, to);
        return [from, to];
      },
      afterUndo: async () => this.migrateTagsFor(to, from),
      afterRedo: async () => this.migrateTagsFor(from, to)
    });
  }

  private copyCommand(kind: 'copy' | 'duplicate', label: string, from: DiskPath, to: DiskPath): FileCommand {
    return {
      kind,
      label,
      paths: [to],
      undo: async store => {
        await store.remove(to);
        return [to];
      },
      redo: async store => {
        await copyEntryToPath(store, from, to);
        return [to];
      }
    };
  }

  /** 移进废纸篓的一批条目：撤销按行 ID 还原本批，重做把还原过的再移回去。 */
  private trashCommand(moves: readonly TrashMove[]): FileCommand {
    const remaining = [...moves];
    const lastUndone: TrashMove[] = [];
    const lastRedone: TrashMove[] = [];
    return {
      kind: 'trash',
      label: 'Move to Trash',
      paths: moves.flatMap(({ original, target }) => [original, target]),
      pending: () => remaining.length,
      undo: async store => {
        const raw = this.mountedRawStore();
        const entries = (await raw.kindOf(TRASH)) === 'directory' ? await raw.list(TRASH) : [];
        const byId = new Map(entries.map(entry => [entry.id, entry]));
        const changed: DiskPath[] = [];
        for (let index = remaining.length - 1; index >= 0; index--) {
          const move = remaining[index];
          const entry = byId.get(move.id);
          if (!entry?.originalPath || !samePath(entry.originalPath, move.original)) continue;
          this.requireWritable(parentOf(entry.originalPath));
          const from = [...TRASH, entry.name];
          changed.push(from, await restoreEntry(store, from));
          lastUndone.push(move);
          remaining.splice(index, 1);
        }
        return changed;
      },
      redo: async store => {
        const changed: DiskPath[] = [];
        for (const move of moves) {
          if (!(await store.kindOf(move.original))) continue;
          await store.move(move.original, move.target);
          lastRedone.push(move);
          changed.push(move.original, move.target);
        }
        return changed;
      },
      afterUndo: async () => this.migrateTrashTags(lastUndone.splice(0), true),
      afterRedo: async () => this.migrateTrashTags(lastRedone.splice(0), false)
    };
  }

  /** 标签键跟着改名/移动迁移到新路径；没有标签时什么也不写。 */
  private migrateTagsFor(from: DiskPath, to: DiskPath): void {
    if (!this.preferences.get(TAGS_KEY, isTagsMap)) return;
    this.preferences
      .update(TAGS_KEY, isTagsMap, current => migrateTags(current ?? {}, from, to))
      .catch((error: unknown) => this.errors.handleError(error));
  }

  /** 标签键跟着废纸篓进出迁移：撤销回到原位置，重做再迁回废纸篓。 */
  private migrateTrashTags(moves: readonly TrashMove[], back: boolean): void {
    if (!moves.length || !this.preferences.get(TAGS_KEY, isTagsMap)) return;
    this.preferences
      .update(TAGS_KEY, isTagsMap, current => {
        let next: TagsMap = current ?? {};
        for (const move of moves)
          next = migrateTags(next, back ? move.target : move.original, back ? move.original : move.target);
        return next;
      })
      .catch((error: unknown) => this.errors.handleError(error));
  }

  /** 撤销/重做的收尾（标签迁移等），失败只报给 ErrorHandler，不打断命令本身。 */
  private async afterHistory(after: (() => Promise<void>) | undefined): Promise<void> {
    if (!after) return;
    try {
      await after();
    } catch (error) {
      this.errors.handleError(error);
    }
  }

  private async mount(): Promise<void> {
    try {
      await this.installed.ready;
      const database = await this.data.ready;
      const store = new RxdbDiskStore({
        repository: () => this.data.repository(DesktopFile),
        instantiate: data => this.data.instantiate(DesktopFile, data),
        storage: () => database.storage,
        contentReleased: id => this.thumbnails.remove(id),
        now: Date.now,
        dataVersion: () => this.data.dataVersion()
      });
      const volume = this.diskVolume(store);
      /*
       * 首次复制内置内容与应用目录对账都在磁盘锁里：两个标签页同时打开桌面时，只有先拿到锁的那个复制与补包，
       * 另一个等它做完、看到完成标记与现成的预装包就直接用（否则两边同时补包会撞上同名的唯一索引，一个标签页的磁盘就挂了）。
       */
      this.marker = await this.data.tabs.exclusive(async () => {
        await store.refresh();
        await recoverDiskBatch(new ProtectedDiskStore(store, () => this.catalog.ownedPackages()), this.batchJournal());
        const marker = await openVolume(volume, this.seeder(), Date.now);
        /* 应用清单是唯一真相源：首次建库、升级旧库与每次启动都走这条幂等对账，补齐缺的预装包（D-17）。 */
        await this.reconcileCurrent(store);
        return marker;
      });
      if (store.revision > 0) this.data.tabs.notify('disk');
      this.store = store;
      this.guardedStore = new ProtectedDiskStore(store, () => this.catalog.ownedPackages());
      this.volume = volume;
      await this.watch();
      this.stateValue.set('ready');
    } catch (error) {
      this.errorValue.set(describeDiskError(error));
      this.stateValue.set('failed');
    }
  }

  /** 订阅全部文件行，组装成树；同一批写入（复制、删除整个文件夹）合并成一次刷新。首个结果到达时完成。 */
  private watch(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const subscription = DesktopFile.findAll({ where: ALL })
        .pipe(auditTime(30))
        .subscribe({
          next: files => {
            this.treeSeq++;
            this.setTree(files);
            resolve();
          },
          error: (error: unknown) => {
            this.fail(error);
            reject(error);
          }
        });
      this.destroyRef.onDestroy(() => subscription.unsubscribe());
    });
  }

  private setTree(files: readonly DesktopFile[]): void {
    const emptyDate = new Date(this.marker?.seededAt ?? Date.now());
    this.rootState.set(buildTree(files.map(toRow), emptyDate));
  }

  private fail(error: unknown): void {
    this.errorValue.set(describeDiskError(error));
    this.stateValue.set('failed');
  }

  /**
   * 从库里整树重读一次（页面回到前台时）。读的期间活查询又发出了更新的结果，这次读到的就是旧的，不覆盖它。
   * 磁盘还没挂载好、或挂载失败时什么也不做：挂载自己会读第一棵树。
   */
  private async reloadTree(): Promise<void> {
    await this.mounted;
    if (this.stateValue() !== 'ready') return;
    const seen = this.treeSeq;
    const files = await (await this.data.repository(DesktopFile)).find({ where: ALL });
    if (this.treeSeq === seen) this.setTree(files);
  }

  /** 卷的完成标记存在系统偏好表里；抹掉时删光文件行，再清空 storage 插件里的文件体。 */
  private diskVolume(store: RxdbDiskStore): DiskVolume {
    const markers = () => this.data.repository(SystemPreference);
    const markerRow = async (): Promise<SystemPreference | undefined> =>
      (await (await markers()).find({ where: keyIs(DISK_MARKER_KEY), limit: 1 }))[0];
    return {
      store,
      readMarker: async () => {
        const value = (await markerRow())?.value;
        return isMarker(value) ? value : null;
      },
      writeMarker: async marker => {
        const row = await markerRow();
        const repository = await markers();
        if (row) await repository.update(row, { value: marker });
        else await repository.create(this.data.instantiate(SystemPreference, { key: DISK_MARKER_KEY, value: marker }));
      },
      clearMarker: async () => {
        const row = await markerRow();
        if (row) await (await markers()).remove(row);
      },
      wipe: async () => {
        for (const entry of await store.list([])) await store.remove([entry.name]);
        await this.data.database.storage.clear(BLOB_DIR);
        await this.thumbnails.clear();
        store.invalidate();
      },
      /* 挂载与抹掉都已经在磁盘锁里（锁不可重入），这里不再加一层。 */
      exclusive: task => task()
    };
  }

  private batchJournal(): DiskBatchJournal {
    return this.operationJournal<DiskBatchRecord>('disk:pending-batch');
  }

  private applicationJournal(): ApplicationJournal {
    return this.operationJournal(APPLICATION_JOURNAL_KEY);
  }

  private operationJournal<T>(key: string) {
    const row = async () =>
      (await (await this.data.repository(SystemPreference)).find({ where: keyIs(key), limit: 1 }))[0];
    return {
      read: async () => (await row())?.value ?? null,
      write: async (value: T) => {
        if (await row()) throw new Error('A previous file operation still needs recovery.');
        await (
          await this.data.repository(SystemPreference)
        ).create(this.data.instantiate(SystemPreference, { key, value }));
      },
      clear: async () => {
        const record = await row();
        if (record) await (await this.data.repository(SystemPreference)).remove(record);
      }
    };
  }

  private async reconcileCurrent(store: DiskStore): Promise<void> {
    const releases = await this.installed.reload();
    const manifests = this.registry.definitionsFor(releases);
    const recovered = await recoverApplicationChange(store, this.applicationJournal(), manifests);
    const signature = JSON.stringify(manifests);
    if (!recovered && signature === this.applicationSignature) return;
    await this.catalog.reconcile(store, manifests);
    this.applicationSignature = signature;
  }

  private seeder(): DiskSeeder {
    return async store => {
      const { photoEncoder } = await import('./photo-encoder');
      await writeSeed(store, buildSeed(), photoEncoder(this.injector));
    };
  }

  private mountedVolume(): DiskVolume {
    if (!this.volume) throw new Error(`Macintosh HD is unavailable: ${this.errorValue() ?? 'not mounted'}`);
    return this.volume;
  }

  private mountedRawStore(): RxdbDiskStore {
    if (!this.store) throw new Error(`Macintosh HD is unavailable: ${this.errorValue() ?? 'not mounted'}`);
    return this.store;
  }

  /** 交给外部任务的存储：经过预装应用的保护判断，Finder、TextEdit、终端回写走同一条规则。 */
  private mountedStore(): DiskStore {
    if (!this.guardedStore) throw new Error(`Macintosh HD is unavailable: ${this.errorValue() ?? 'not mounted'}`);
    return this.guardedStore;
  }

  /**
   * 串行执行一次磁盘任务：本标签页内按调用顺序排队，再在跨标签页的磁盘锁里执行，所以任何两次读写都不会交错。
   * 进锁之后先对一遍库（别的标签页改过就丢掉内存索引），任务改过磁盘就广播通知别的标签页。锁不可重入：任务里不能再调它。
   */
  private exclusive<T>(task: (store: DiskStore) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      await this.mounted;
      return this.data.tabs.exclusive(async () => {
        this.data.locationGuard.assertCurrent();
        const raw = this.mountedRawStore();
        await raw.refresh();
        const before = raw.revision;
        try {
          await this.reconcileCurrent(raw);
          await recoverDiskBatch(this.mountedStore(), this.batchJournal());
          return await task(this.mountedStore());
        } finally {
          if (raw.revision !== before) this.data.tabs.notify('disk');
        }
      });
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

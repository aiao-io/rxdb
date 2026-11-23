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
  ImportedFile,
  copyEntryTo,
  duplicateEntry,
  importFiles as importEntries,
  moveEntryTo,
  renameEntry,
  restoreEntry
} from '../disk/file-operations';
import { ProtectedDiskStore } from '../disk/protected-store';
import { BLOB_DIR, RxdbDiskStore } from '../disk/rxdb-disk-store';
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

const TRASH_UNDO_LIMIT = 50;

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
  private readonly trashUndo = signal<readonly (readonly TrashMove[])[]>([]);
  private readonly pendingTrashMoves = signal(0);

  readonly root = this.rootState.asReadonly();
  readonly state = this.stateValue.asReadonly();
  readonly error = this.errorValue.asReadonly();
  /** 废纸篓里有东西时 Dock 显示满的图标。 */
  readonly trashFull = computed(() => (findNode(this.rootState(), TRASH)?.children?.length ?? 0) > 0);
  readonly canUndoTrash = computed(() => this.pendingTrashMoves() > 0 || this.trashUndo().length > 0);
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
    this.notifyChanges([[...dir, name]]);
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
          if (moved.length) this.trashUndo.update(history => [...history.slice(1 - TRASH_UNDO_LIMIT), moved]);
        }
      });
    } finally {
      this.pendingTrashMoves.update(count => count - 1);
      if (moved.length) this.notifyChanges(moved.flatMap(({ original, target }) => [original, target]));
    }
  }

  /** 在同一把磁盘锁内核对 RxDB 行 ID，再沿用 Put Back 恢复，避免碰到同名的另一条记录。 */
  async undoTrash(): Promise<void> {
    const changed: DiskPath[] = [];
    try {
      await this.exclusive(async store => {
        const history = this.trashUndo();
        const batch = history.at(-1);
        if (!batch) return;
        const raw = this.mountedRawStore();
        const entries = (await raw.kindOf(TRASH)) === 'directory' ? await raw.list(TRASH) : [];
        const byId = new Map(entries.map(entry => [entry.id, entry]));
        const remaining = [...batch];
        try {
          for (const move of batch.toReversed()) {
            const entry = byId.get(move.id);
            if (entry?.originalPath && samePath(entry.originalPath, move.original)) {
              this.requireWritable(parentOf(entry.originalPath));
              const from = [...TRASH, entry.name];
              changed.push(from, await restoreEntry(store, from));
            }
            remaining.pop();
          }
        } finally {
          const older = history.slice(0, -1);
          this.trashUndo.set(remaining.length ? [...older, remaining] : older);
        }
      });
    } finally {
      if (changed.length) this.notifyChanges(changed);
    }
  }

  /** Finder 改名：系统目录与预装应用的保护同样适用。 */
  async rename(path: DiskPath, name: string): Promise<DiskPath> {
    if (isRequiredDiskPath(path))
      throw new DiskError('EACCES', path, 'This item is required by the system and cannot be renamed.');
    const target = await this.exclusive(store => renameEntry(store, path, name));
    this.notifyChanges([path, target]);
    return target;
  }

  async duplicate(path: DiskPath): Promise<DiskPath> {
    this.requireWritable(parentOf(path));
    const target = await this.exclusive(store => duplicateEntry(store, path, this.batchJournal()));
    this.notifyChanges([target]);
    return target;
  }

  async copyTo(path: DiskPath, dir: DiskPath): Promise<DiskPath> {
    this.requireWritable(dir);
    const target = await this.exclusive(store => copyEntryTo(store, path, dir, this.batchJournal()));
    this.notifyChanges([target]);
    return target;
  }

  async moveTo(path: DiskPath, dir: DiskPath): Promise<DiskPath> {
    if (isRequiredDiskPath(path))
      throw new DiskError('EACCES', path, 'This item is required by the system and cannot be moved.');
    this.requireWritable(parentOf(path));
    this.requireWritable(dir);
    const target = await this.exclusive(store => moveEntryTo(store, path, dir));
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

  async emptyTrash(): Promise<void> {
    const removed = await this.exclusive(async store => {
      const entries = (await store.kindOf(TRASH)) === 'directory' ? await store.list(TRASH) : [];
      for (const entry of entries) await store.remove([...TRASH, entry.name]);
      this.trashUndo.set([]);
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
      this.trashUndo.set([]);
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
      throw new DiskError('ENOENT', path, `The item “${name}” can’t be moved to the Trash because it no longer exists.`);
    await store.mkdir(TRASH);
    const names = (await store.list(TRASH)).map(entry => entry.name);
    const target = [...TRASH, uniqueName(names, name)];
    await store.move(path, target);
    return { id, original: [...path], target };
  }

  private requireWritable(dir: DiskPath): void {
    if (isLocked(dir)) throw new DiskError('EACCES', dir, 'You do not have permission to change this folder.');
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

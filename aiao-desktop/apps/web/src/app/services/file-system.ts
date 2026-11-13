import { DestroyRef, EnvironmentInjector, ErrorHandler, Service, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, auditTime } from 'rxjs';

import { DesktopData, keyIs } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { DesktopFile } from '../disk/desktop-file.entity';
import {
  DESKTOP,
  DISK_ROOTS,
  DiskPath,
  HOME,
  TRASH,
  VOLUME_NAME,
  finderPathOf,
  isWithin,
  samePath,
  uniqueName
} from '../disk/disk-path';
import { buildSeed, writeSeed } from '../disk/disk-seed';
import { DiskError, DiskStore } from '../disk/disk-store';
import { FileRow, FsNode, buildTree, emptyVolume, nodeAt as findNode, searchNodes } from '../disk/disk-tree';
import { DiskMarker, DiskSeeder, DiskVolume, eraseVolume, openVolume } from '../disk/disk-volume';
import { ProtectedDiskStore } from '../disk/protected-store';
import { BLOB_DIR, RxdbDiskStore } from '../disk/rxdb-disk-store';
import { ApplicationCatalog } from './application-catalog';
import { photoEncoder } from './photo-encoder';

export type { FsNode } from '../disk/disk-tree';

export type DiskState = 'mounting' | 'ready' | 'failed';

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
  prasenjit: finderPathOf(HOME),
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

/** 主目录里 macOS 不允许移走的文件夹。 */
const HOME_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Public', '.Trash'];

/** 卷根、顶层目录、主目录与其中的标准文件夹，以及 System 里的一切，都由「系统」管理。 */
const isRequired = (path: DiskPath): boolean =>
  path.length <= 1 ||
  path[0] === 'System' ||
  samePath(path, HOME) ||
  (path.length === HOME.length + 1 && isWithin(path, HOME) && HOME_FOLDERS.includes(path[HOME.length]));

const isLocked = (dir: DiskPath): boolean => dir.length === 0 || dir[0] === 'System';

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
  modified: file.modifiedAt
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
  private readonly data = inject(DesktopData);
  private readonly preferences = inject(Preferences);
  private readonly injector = inject(EnvironmentInjector);
  private readonly catalog = inject(ApplicationCatalog);
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
  private readonly mounted: Promise<void>;

  readonly root = this.rootState.asReadonly();
  readonly state = this.stateValue.asReadonly();
  readonly error = this.errorValue.asReadonly();
  /** 废纸篓里有东西时 Dock 显示满的图标。 */
  readonly trashFull = computed(() => (findNode(this.rootState(), TRASH)?.children?.length ?? 0) > 0);
  /** 桌面这一侧改动过的路径（新建、移动、写入、删除）；终端的虚拟机据此同步同一路径。 */
  readonly changes = new Subject<readonly DiskPath[]>();

  constructor() {
    this.mounted = this.mount();
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
    this.changes.next([[...dir, name]]);
    return name;
  }

  /** 移进 `~/.Trash`，重名时追加序号。 */
  async moveToTrash(path: DiskPath): Promise<void> {
    const name = path.at(-1) ?? VOLUME_NAME;
    if (isRequired(path))
      throw new DiskError(
        'EACCES',
        path,
        `The item “${name}” can’t be moved to the Trash because it’s required by macOS.`
      );
    if (isWithin(path, TRASH)) throw new DiskError('EEXIST', path, `“${name}” is already in the Trash.`);
    const violation = this.catalog.violation({ kind: 'move', from: path, to: [...TRASH, name] });
    if (violation)
      throw new DiskError('EACCES', path, violation.replace('can’t be moved', 'can’t be moved to the Trash'));
    const target = await this.exclusive(async store => {
      await store.mkdir(TRASH);
      const to = [
        ...TRASH,
        uniqueName(
          (await store.list(TRASH)).map(entry => entry.name),
          name
        )
      ];
      try {
        await store.move(path, to);
      } catch (error) {
        if (error instanceof DiskError && error.code === 'ENOENT' && samePath(error.path, path))
          throw new DiskError(
            'ENOENT',
            path,
            `The item “${name}” can’t be moved to the Trash because it no longer exists.`
          );
        throw error;
      }
      return to;
    });
    this.changes.next([path, target]);
  }

  async emptyTrash(): Promise<void> {
    const removed = await this.exclusive(async store => {
      const entries = (await store.kindOf(TRASH)) === 'directory' ? await store.list(TRASH) : [];
      for (const entry of entries) await store.remove([...TRASH, entry.name]);
      return entries.map(entry => [...TRASH, entry.name]);
    });
    this.changes.next(removed);
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
    this.changes.next([path]);
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
    this.changes.next([path]);
  }

  /** 抹掉整块磁盘并恢复内置内容（磁盘工具的「抹掉」）。 */
  async erase(): Promise<void> {
    await this.exclusive(async () => {
      this.marker = await eraseVolume(this.mountedVolume(), this.seeder(), Date.now);
      /* 抹掉后由应用清单重新生成 /Applications 里的预装包（D-17）。 */
      await this.catalog.reconcile(this.mountedRawStore());
    });
    this.changes.next(DISK_ROOTS.map(root => [root]));
  }

  /** 给终端的虚拟机同步用：在同一条串行队列里直接读写存储后端。 */
  run<T>(task: (store: DiskStore) => Promise<T>): Promise<T> {
    return this.exclusive(task);
  }

  private async mount(): Promise<void> {
    try {
      const database = await this.data.ready;
      const store = new RxdbDiskStore({
        repository: () => this.data.repository(DesktopFile),
        instantiate: data => this.data.instantiate(DesktopFile, data),
        storage: () => database.storage,
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
        const marker = await openVolume(volume, this.seeder(), Date.now);
        /* 应用清单是唯一真相源：首次建库、升级旧库与每次启动都走这条幂等对账，补齐缺的预装包（D-17）。 */
        await this.catalog.reconcile(store);
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
        store.invalidate();
      },
      /* 挂载与抹掉都已经在磁盘锁里（锁不可重入），这里不再加一层。 */
      exclusive: task => task()
    };
  }

  private seeder(): DiskSeeder {
    const encodeImage = photoEncoder(this.injector);
    return store => writeSeed(store, buildSeed(), encodeImage);
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
        const raw = this.mountedRawStore();
        await raw.refresh();
        const before = raw.revision;
        try {
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

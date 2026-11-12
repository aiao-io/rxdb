import { EnvironmentInjector, Service, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

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
import { FsNode, emptyVolume, nodeAt as findNode, scanDisk, searchNodes } from '../disk/disk-tree';
import { DiskMarker, DiskSeeder, DiskVolume, eraseVolume, openVolume } from '../disk/disk-volume';
import { openOpfsVolume } from '../disk/opfs-disk-store';
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

/** 「最近使用」的初始内容；之后打开过的文件排到最前面。 */
const RECENT_SEED: readonly DiskPath[] = [
  [...DESKTOP, 'Projects', 'desktop-web', 'index.html'],
  [...DESKTOP, 'prasenx.txt'],
  [...HOME, 'Documents', 'Writing', 'on-restraint.md'],
  [...HOME, 'Downloads', 'render-final.mp4'],
  [...DESKTOP, 'Interface Guidelines.pdf']
];

/** 主目录里 macOS 不允许移走的文件夹。 */
const HOME_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Public', '.Trash'];

/** 卷根、顶层目录、主目录与其中的标准文件夹，以及 System 里的一切，都由「系统」管理。 */
const isRequired = (path: DiskPath): boolean =>
  path.length <= 1 ||
  path[0] === 'System' ||
  samePath(path, HOME) ||
  (path.length === HOME.length + 1 && isWithin(path, HOME) && HOME_FOLDERS.includes(path[HOME.length]));

const isLocked = (dir: DiskPath): boolean => dir.length === 0 || dir[0] === 'System';

const encoder = new TextEncoder();

/** 给界面用的错误文字：磁盘错误自带 Finder 风格的说明。 */
export const describeDiskError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Macintosh HD：OPFS 里的一块真磁盘（`aiao-desktop/disk`）。首次打开时复制内置内容，之后保留所有改动。
 * 读写都经过一条串行队列，写完重新扫描出一棵不可变的索引树，Finder、桌面与聚焦搜索同步地读它。
 */
@Service({ autoProvided: false })
export class FileSystem {
  private readonly injector = inject(EnvironmentInjector);
  private readonly rootState = signal<FsNode>(emptyVolume());
  private readonly stateValue = signal<DiskState>('mounting');
  private readonly errorValue = signal<string | null>(null);
  private readonly recentPaths = signal<readonly DiskPath[]>(RECENT_SEED);
  private volume: DiskVolume | null = null;
  private marker: DiskMarker | null = null;
  private queue: Promise<unknown> = Promise.resolve();
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
    return this.recentPaths()
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
    this.recentPaths.update(paths => [path, ...paths.filter(other => !samePath(other, path))].slice(0, 20));
  }

  /** 在目录里新建「untitled folder」，重名时追加序号；返回新名字。 */
  async newFolder(dir: DiskPath): Promise<string> {
    if (isLocked(dir))
      throw new DiskError('EACCES', dir, 'The folder “untitled folder” can’t be created because you don’t have permission.');
    const name = await this.exclusive(async store => {
      const folder = uniqueName((await store.list(dir)).map(entry => entry.name), 'untitled folder');
      await store.mkdir([...dir, folder]);
      return folder;
    }, true);
    this.changes.next([[...dir, name]]);
    return name;
  }

  /** 移进 `~/.Trash`，重名时追加序号。 */
  async moveToTrash(path: DiskPath): Promise<void> {
    const name = path.at(-1) ?? VOLUME_NAME;
    if (isRequired(path))
      throw new DiskError('EACCES', path, `The item “${name}” can’t be moved to the Trash because it’s required by macOS.`);
    if (isWithin(path, TRASH)) throw new DiskError('EEXIST', path, `“${name}” is already in the Trash.`);
    const target = await this.exclusive(async store => {
      await store.mkdir(TRASH);
      const to = [...TRASH, uniqueName((await store.list(TRASH)).map(entry => entry.name), name)];
      await store.move(path, to);
      return to;
    }, true);
    this.changes.next([path, target]);
  }

  async emptyTrash(): Promise<void> {
    const removed = await this.exclusive(async store => {
      const entries = (await store.kindOf(TRASH)) === 'directory' ? await store.list(TRASH) : [];
      for (const entry of entries) await store.remove([...TRASH, entry.name]);
      return entries.map(entry => [...TRASH, entry.name]);
    }, true);
    this.changes.next(removed);
  }

  read(path: DiskPath): Promise<Uint8Array> {
    return this.exclusive(store => store.read(path), false);
  }

  async readText(path: DiskPath): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }

  async writeText(path: DiskPath, text: string): Promise<void> {
    await this.exclusive(store => store.write(path, encoder.encode(text)), true);
    this.changes.next([path]);
  }

  /** 抹掉整块磁盘并恢复内置内容（磁盘工具的「抹掉」）。 */
  async erase(): Promise<void> {
    await this.exclusive(async () => {
      this.marker = await eraseVolume(this.mountedVolume(), this.seeder(), Date.now);
    }, true);
    this.changes.next(DISK_ROOTS.map(root => [root]));
  }

  /** 给终端的虚拟机同步用：在同一条队列里读写；`changed` 为真时之后重新扫描（不再通知虚拟机，改动本来就来自它）。 */
  run<T>(task: (store: DiskStore) => Promise<T>, changed: boolean): Promise<T> {
    return this.exclusive(task, changed);
  }

  private async mount(): Promise<void> {
    try {
      const volume = await openOpfsVolume();
      this.marker = await openVolume(volume, this.seeder(), Date.now);
      this.volume = volume;
      await this.rescan();
      this.stateValue.set('ready');
    } catch (error) {
      this.errorValue.set(describeDiskError(error));
      this.stateValue.set('failed');
    }
  }

  private seeder(): DiskSeeder {
    const encodeImage = photoEncoder(this.injector);
    return store => writeSeed(store, buildSeed(), encodeImage);
  }

  private mountedVolume(): DiskVolume {
    if (!this.volume) throw new Error(`Macintosh HD is unavailable: ${this.errorValue() ?? 'not mounted'}`);
    return this.volume;
  }

  private async rescan(): Promise<void> {
    const emptyDate = new Date(this.marker?.seededAt ?? Date.now());
    this.rootState.set(await scanDisk(this.mountedVolume().store, emptyDate));
  }

  /** 串行执行一次磁盘任务；`rescan` 为真时任务结束后（无论成败）重新扫描索引。 */
  private exclusive<T>(task: (store: DiskStore) => Promise<T>, rescan: boolean): Promise<T> {
    const run = this.queue.then(async () => {
      await this.mounted;
      const store = this.mountedVolume().store;
      try {
        return await task(store);
      } finally {
        if (rescan) await this.rescan();
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

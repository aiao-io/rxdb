import { DiskPath, fromVmPath, toVmPath } from '../disk/disk-path';
import { DiskStore } from '../disk/disk-store';
import { VmFs, VmStat, VmTree } from './vm-fs';

/** 虚拟机里卷目录的一次扫描：路径 → 类型、大小与修改时间。 */
export type VmSnapshot = ReadonlyMap<string, VmStat>;

/** 两次扫描之间终端做的改动：删掉的（只列最上层）、新建的目录（由浅到深）、新建或改过的文件。 */
export interface VmDiff {
  readonly removed: readonly string[];
  readonly folders: readonly string[];
  readonly files: readonly string[];
}

/** 磁盘这一侧：在 FileSystem 的串行队列里读写。 */
export interface DiskAccess {
  run<T>(task: (store: DiskStore) => Promise<T>): Promise<T>;
}

export interface SyncOptions {
  /** 卷的顶层目录，在虚拟机里挂在根目录下。 */
  readonly roots: readonly string[];
  /** 不同步的名字（例如 `node_modules`），在任何深度都跳过。 */
  readonly ignore: (name: string) => boolean;
}

const DIRECTORY: VmStat = { kind: 'directory', size: 0, mtimeMs: 0 };

const within = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

const depth = (path: string): number => path.split('/').length;

const changed = (before: VmStat | undefined, after: VmStat): boolean =>
  !before || before.kind !== 'file' || before.size !== after.size || before.mtimeMs !== after.mtimeMs;

export function diffSnapshots(before: VmSnapshot, after: VmSnapshot): VmDiff {
  const gone = [...before].filter(([path, stat]) => after.get(path)?.kind !== stat.kind).map(([path]) => path);
  return {
    removed: gone.filter(path => !gone.some(other => other !== path && within(path, other))),
    folders: [...after]
      .filter(([path, stat]) => stat.kind === 'directory' && before.get(path)?.kind !== 'directory')
      .map(([path]) => path)
      .sort((a, b) => depth(a) - depth(b)),
    files: [...after].filter(([path, stat]) => stat.kind === 'file' && changed(before.get(path), stat)).map(([path]) => path)
  };
}

async function readTree(store: DiskStore, dir: DiskPath, ignore: (name: string) => boolean): Promise<VmTree> {
  const tree: Record<string, VmTree[string]> = {};
  for (const entry of await store.list(dir)) {
    if (ignore(entry.name)) continue;
    const path = [...dir, entry.name];
    tree[entry.name] =
      entry.kind === 'directory' ?
        { directory: await readTree(store, path, ignore) }
      : { file: { contents: await store.read(path) } };
  }
  return tree;
}

/**
 * 磁盘与终端虚拟机之间的同步。打开终端时把整块磁盘复制进虚拟机；之后
 * 终端里的改动靠扫描发现（Vivari 的 fs 事件不报虚拟机里进程自己的写入），写回磁盘；
 * 桌面这边的改动按路径推进去，并刷新扫描基线，所以不会被当成终端的改动再写回来。
 * 两个方向都以「当时的状态」为准，所有操作串行执行。
 */
export class DiskVmSync {
  private snapshot: VmSnapshot = new Map();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly disk: DiskAccess,
    private readonly vm: VmFs,
    private readonly options: SyncOptions
  ) {}

  /** 清掉虚拟机里上一轮残留的卷目录（Vivari 会从它自己的 OPFS 镜像恢复旧内容），再挂上整块磁盘。 */
  attach(): Promise<void> {
    return this.serial(async () => {
      for (const root of this.options.roots) await this.vm.remove(`/${root}`);
      await this.vm.mount(await this.disk.run(store => this.rootsTree(store)), '/');
      this.snapshot = await this.scan(this.rootPaths());
    });
  }

  /** 把终端自上次以来的改动写回磁盘；有改动时返回 `true`。 */
  pull(): Promise<boolean> {
    return this.serial(() => this.pullChanges());
  }

  /** 让虚拟机里的这些路径与磁盘一致（新建、写入、移动、删除都按磁盘当前的状态处理）。 */
  push(paths: readonly DiskPath[]): Promise<void> {
    return this.serial(async () => {
      for (const path of paths) await this.pushPath(path);
    });
  }

  private rootPaths(): string[] {
    return this.options.roots.map(root => `/${root}`);
  }

  private async rootsTree(store: DiskStore): Promise<VmTree> {
    const tree: Record<string, VmTree[string]> = {};
    for (const root of this.options.roots)
      if ((await store.kindOf([root])) === 'directory')
        tree[root] = { directory: await readTree(store, [root], this.options.ignore) };
    return tree;
  }

  private async pullChanges(): Promise<boolean> {
    const current = await this.scan(this.rootPaths());
    const diff = diffSnapshots(this.snapshot, current);
    if (!diff.removed.length && !diff.folders.length && !diff.files.length) {
      this.snapshot = current;
      return false;
    }
    const contents = await this.readFiles(diff.files);
    await this.disk.run(async store => {
      for (const path of diff.removed) await store.remove(fromVmPath(path));
      for (const path of diff.folders) await store.mkdir(fromVmPath(path));
      for (const [path, data] of contents) await store.write(fromVmPath(path), data);
    });
    this.snapshot = current;
    return true;
  }

  /** 扫描之后才消失的文件跳过，下一轮扫描会把它当作删除。 */
  private async readFiles(paths: readonly string[]): Promise<Map<string, Uint8Array>> {
    const contents = new Map<string, Uint8Array>();
    for (const path of paths) {
      const data = await this.vm.read(path).catch(async (error: unknown) => {
        if ((await this.vm.stat(path)) === null) return null;
        throw error;
      });
      if (data) contents.set(path, data);
    }
    return contents;
  }

  private async pushPath(path: DiskPath): Promise<void> {
    if (!path.length || !this.options.roots.includes(path[0])) return;
    const vmPath = toVmPath(path);
    const kind = await this.disk.run(store => store.kindOf(path));
    await this.vm.remove(vmPath);
    if (kind === 'file') await this.vm.write(vmPath, await this.disk.run(store => store.read(path)));
    if (kind === 'directory') {
      await this.vm.mkdir(vmPath);
      await this.vm.mount(await this.disk.run(store => readTree(store, path, this.options.ignore)), vmPath);
    }
    const next = new Map([...this.snapshot].filter(([key]) => !within(key, vmPath)));
    if (kind !== null) for (const [key, stat] of await this.scan([vmPath])) next.set(key, stat);
    this.snapshot = next;
  }

  private async scan(starts: readonly string[]): Promise<Map<string, VmStat>> {
    const out = new Map<string, VmStat>();
    for (const start of starts) {
      const stat = await this.vm.stat(start);
      if (!stat) continue;
      out.set(start, stat);
      if (stat.kind === 'directory') await this.walk(start, out);
    }
    return out;
  }

  private async walk(dir: string, out: Map<string, VmStat>): Promise<void> {
    for (const entry of await this.vm.list(dir)) {
      if (entry.kind === 'other' || this.options.ignore(entry.name)) continue;
      const path = `${dir}/${entry.name}`;
      const stat = entry.kind === 'directory' ? DIRECTORY : await this.vm.stat(path);
      if (!stat) continue;
      out.set(path, stat);
      if (stat.kind === 'directory') await this.walk(path, out);
    }
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

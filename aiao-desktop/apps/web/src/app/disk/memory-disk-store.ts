import { DiskPath, parentOf } from './disk-path';
import { DiskEntry, DiskEntryKind, DiskError, DiskFileInfo, DiskStore } from './disk-store';
import { DiskMarker, DiskVolume } from './disk-volume';

interface MemoryFile {
  readonly kind: 'file';
  readonly data: Uint8Array;
  readonly modified: number;
}

interface MemoryDirectory {
  readonly kind: 'directory';
  readonly children: Map<string, MemoryNode>;
}

type MemoryNode = MemoryFile | MemoryDirectory;

const directory = (): MemoryDirectory => ({ kind: 'directory', children: new Map() });

/** 内存里的磁盘，单测用；行为与 OPFS 实现一致（列目录按名字排序，便于断言）。 */
export class MemoryDiskStore implements DiskStore {
  private readonly root = directory();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  async list(dir: DiskPath): Promise<DiskEntry[]> {
    const node = this.directoryAt(dir);
    return [...node.children]
      .map(([name, child]) => ({ name, kind: child.kind }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async kindOf(path: DiskPath): Promise<DiskEntryKind | null> {
    return this.find(path)?.kind ?? null;
  }

  async info(file: DiskPath): Promise<DiskFileInfo> {
    const node = this.fileAt(file);
    return { size: node.data.length, modified: node.modified };
  }

  async read(file: DiskPath): Promise<Uint8Array> {
    return this.fileAt(file).data.slice();
  }

  async write(file: DiskPath, data: Uint8Array): Promise<void> {
    const parent = this.directoryAt(parentOf(file), true);
    if (parent.children.get(this.nameOf(file))?.kind === 'directory') throw new DiskError('EISDIR', file);
    parent.children.set(this.nameOf(file), { kind: 'file', data: data.slice(), modified: this.clock() });
  }

  async mkdir(dir: DiskPath): Promise<void> {
    this.directoryAt(dir, true);
  }

  async remove(path: DiskPath): Promise<void> {
    const parent = this.find(parentOf(path));
    if (parent?.kind === 'directory') parent.children.delete(this.nameOf(path));
  }

  async move(from: DiskPath, to: DiskPath): Promise<void> {
    const node = this.find(from);
    if (!node) throw new DiskError('ENOENT', from);
    const target = this.directoryAt(parentOf(to), true);
    if (target.children.has(this.nameOf(to))) throw new DiskError('EEXIST', to);
    target.children.set(this.nameOf(to), node);
    (this.find(parentOf(from)) as MemoryDirectory).children.delete(this.nameOf(from));
  }

  private nameOf(path: DiskPath): string {
    const name = path.at(-1);
    if (name === undefined) throw new DiskError('EACCES', path, 'The volume root cannot be replaced');
    return name;
  }

  private find(path: DiskPath): MemoryNode | null {
    let node: MemoryNode = this.root;
    for (const name of path) {
      const next: MemoryNode | undefined = node.kind === 'directory' ? node.children.get(name) : undefined;
      if (!next) return null;
      node = next;
    }
    return node;
  }

  private directoryAt(path: DiskPath, create = false): MemoryDirectory {
    let node: MemoryDirectory = this.root;
    for (const [depth, name] of path.entries()) {
      const next = node.children.get(name) ?? (create ? directory() : undefined);
      if (!next) throw new DiskError('ENOENT', path.slice(0, depth + 1));
      if (next.kind !== 'directory') throw new DiskError('ENOTDIR', path.slice(0, depth + 1));
      node.children.set(name, next);
      node = next;
    }
    return node;
  }

  private fileAt(path: DiskPath): MemoryFile {
    const node = this.find(path);
    if (!node) throw new DiskError('ENOENT', path);
    if (node.kind !== 'file') throw new DiskError('EISDIR', path);
    return node;
  }
}

/** 内存卷：完成标记与独占都在内存里，单测用。 */
export function memoryVolume(store = new MemoryDiskStore()): DiskVolume {
  let marker: DiskMarker | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    store,
    readMarker: async () => marker,
    writeMarker: async next => {
      marker = next;
    },
    clearMarker: async () => {
      marker = null;
    },
    wipe: async () => {
      for (const entry of await store.list([])) await store.remove([entry.name]);
    },
    exclusive: task => {
      const run = queue.then(task);
      queue = run.catch(() => undefined);
      return run;
    }
  };
}

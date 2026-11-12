import { describe, expect, it } from 'vitest';

import { DiskStore } from '../disk/disk-store';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { DiskVmSync, VmSnapshot, diffSnapshots } from './disk-vm-sync';
import { VmEntry, VmFs, VmStat, VmTree } from './vm-fs';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

/** 内存里的「虚拟机文件系统」：路径 → 文件或目录，写入时 mtime 递增。 */
class FakeVm implements VmFs {
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>(['/']);
  private readonly times = new Map<string, number>();
  private clock = 1;

  async list(path: string): Promise<VmEntry[]> {
    const prefix = path === '/' ? '/' : `${path}/`;
    const names = new Map<string, VmEntry['kind']>();
    for (const dir of this.dirs) if (this.isChild(prefix, dir)) names.set(dir.slice(prefix.length), 'directory');
    for (const file of this.files.keys()) if (this.isChild(prefix, file)) names.set(file.slice(prefix.length), 'file');
    return [...names].map(([name, kind]) => ({ name, kind }));
  }

  async stat(path: string): Promise<VmStat | null> {
    const file = this.files.get(path);
    if (file) return { kind: 'file', size: file.length, mtimeMs: this.times.get(path) ?? 0 };
    return this.dirs.has(path) ? { kind: 'directory', size: 0, mtimeMs: this.times.get(path) ?? 0 } : null;
  }

  async read(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error(`ENOENT ${path}`);
    return file;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.mkdir(path.slice(0, path.lastIndexOf('/')) || '/');
    this.files.set(path, data);
    this.times.set(path, this.clock++);
  }

  async mkdir(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) this.dirs.add(`/${parts.slice(0, i).join('/')}`);
  }

  async remove(path: string): Promise<void> {
    for (const file of [...this.files.keys()]) if (file === path || file.startsWith(`${path}/`)) this.files.delete(file);
    for (const dir of [...this.dirs]) if (dir === path || dir.startsWith(`${path}/`)) this.dirs.delete(dir);
  }

  async mount(tree: VmTree, mountPoint: string): Promise<void> {
    await this.mkdir(mountPoint);
    for (const [name, node] of Object.entries(tree)) {
      const path = mountPoint === '/' ? `/${name}` : `${mountPoint}/${name}`;
      if ('file' in node) await this.write(path, node.file.contents);
      else await this.mount(node.directory, path);
    }
  }

  private isChild(prefix: string, path: string): boolean {
    return path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes('/');
  }
}

const access = (store: DiskStore) => ({ run: <T>(task: (s: DiskStore) => Promise<T>) => task(store) });

async function setup() {
  const store = new MemoryDiskStore();
  await store.write(['Users', 'me', 'Desktop', 'note.txt'], text('hello'));
  await store.mkdir(['Users', 'me', 'Documents']);
  await store.write(['Applications', 'Notes.app', 'Contents', 'Info.plist'], text('<plist/>'));
  const vm = new FakeVm();
  await vm.write('/Users/stale.txt', text('left over from a previous VM session'));
  await vm.write('/home/user/.cache/npm/x', text('cache'));
  const sync = new DiskVmSync(access(store), vm, { roots: ['Applications', 'Users'], ignore: name => name === 'node_modules' });
  await sync.attach();
  return { store, vm, sync };
}

describe('diffSnapshots', () => {
  const file = (size: number, mtimeMs: number): VmStat => ({ kind: 'file', size, mtimeMs });
  const dir: VmStat = { kind: 'directory', size: 0, mtimeMs: 0 };

  it('只报最上层被删的路径；新目录由浅到深；新文件与改动过的文件', () => {
    const before: VmSnapshot = new Map([
      ['/Users', dir],
      ['/Users/a', dir],
      ['/Users/a/b.txt', file(1, 1)],
      ['/Users/c.txt', file(1, 1)],
      ['/Users/same.txt', file(2, 5)]
    ]);
    const after: VmSnapshot = new Map([
      ['/Users', dir],
      ['/Users/c.txt', file(3, 9)],
      ['/Users/same.txt', file(2, 5)],
      ['/Users/n', dir],
      ['/Users/n/m', dir],
      ['/Users/n/m/new.txt', file(4, 2)]
    ]);
    expect(diffSnapshots(before, after)).toEqual({
      removed: ['/Users/a'],
      folders: ['/Users/n', '/Users/n/m'],
      files: ['/Users/c.txt', '/Users/n/m/new.txt']
    });
  });

  it('同一路径从文件变成目录时，先删后建', () => {
    const diff = diffSnapshots(new Map([['/Users/x', file(1, 1)]]), new Map([['/Users/x', dir]]));
    expect(diff).toEqual({ removed: ['/Users/x'], folders: ['/Users/x'], files: [] });
  });
});

describe('DiskVmSync', () => {
  it('挂载时清掉虚拟机里上一轮残留的卷目录，再复制整块磁盘', async () => {
    const { vm } = await setup();
    expect(vm.files.has('/Users/stale.txt')).toBe(false);
    expect(decode(await vm.read('/Users/me/Desktop/note.txt'))).toBe('hello');
    expect(vm.dirs.has('/Users/me/Documents')).toBe(true);
    expect(vm.files.has('/home/user/.cache/npm/x')).toBe(true);
  });

  it('终端里新建、修改、删除的文件同步回磁盘', async () => {
    const { store, vm, sync } = await setup();
    await vm.write('/Users/me/Desktop/new.txt', text('from shell'));
    await vm.write('/Users/me/Desktop/note.txt', text('edited'));
    await vm.remove('/Users/me/Documents');
    await vm.mkdir('/Users/me/Projects/demo');
    expect(await sync.pull()).toBe(true);
    expect(decode(await store.read(['Users', 'me', 'Desktop', 'new.txt']))).toBe('from shell');
    expect(decode(await store.read(['Users', 'me', 'Desktop', 'note.txt']))).toBe('edited');
    expect(await store.kindOf(['Users', 'me', 'Documents'])).toBeNull();
    expect(await store.kindOf(['Users', 'me', 'Projects', 'demo'])).toBe('directory');
    expect(await sync.pull()).toBe(false);
  });

  it('node_modules 与卷以外的路径不同步', async () => {
    const { store, vm, sync } = await setup();
    await vm.write('/Users/me/app/node_modules/lib/index.js', text('x'));
    await vm.write('/tmp/scratch.txt', text('x'));
    expect(await sync.pull()).toBe(true);
    expect(await store.kindOf(['Users', 'me', 'app'])).toBe('directory');
    expect(await store.kindOf(['Users', 'me', 'app', 'node_modules'])).toBeNull();
    expect(await store.kindOf(['tmp'])).toBeNull();
  });

  it('桌面这边的改动推进虚拟机，之后的扫描不会把它当成终端的改动', async () => {
    const { store, vm, sync } = await setup();
    await store.write(['Users', 'me', 'Desktop', 'saved.txt'], text('from TextEdit'));
    await store.move(['Users', 'me', 'Desktop', 'note.txt'], ['Users', 'me', '.Trash', 'note.txt']);
    await store.mkdir(['Users', 'me', 'Desktop', 'untitled folder']);
    await sync.push([
      ['Users', 'me', 'Desktop', 'saved.txt'],
      ['Users', 'me', 'Desktop', 'note.txt'],
      ['Users', 'me', '.Trash', 'note.txt'],
      ['Users', 'me', 'Desktop', 'untitled folder']
    ]);
    expect(decode(await vm.read('/Users/me/Desktop/saved.txt'))).toBe('from TextEdit');
    expect(vm.files.has('/Users/me/Desktop/note.txt')).toBe(false);
    expect(decode(await vm.read('/Users/me/.Trash/note.txt'))).toBe('hello');
    expect(vm.dirs.has('/Users/me/Desktop/untitled folder')).toBe(true);
    expect(await sync.pull()).toBe(false);
  });

  it('卷以外的路径不推', async () => {
    const { vm, sync } = await setup();
    await sync.push([['Library', 'Caches']]);
    expect(vm.dirs.has('/Library')).toBe(false);
  });
});

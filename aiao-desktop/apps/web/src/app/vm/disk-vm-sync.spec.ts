import { describe, expect, it, vi } from 'vitest';

import { DiskStore } from '../disk/disk-store';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { FakeVm } from '../testing/fake-vm';
import { DiskVmSync, PulledChange, SyncOptions, VmSnapshot, diffSnapshots } from './disk-vm-sync';
import type { VmStat } from './vm-fs';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const access = (store: DiskStore) => ({ run: <T>(task: (s: DiskStore) => Promise<T>) => task(store) });

async function setup(options: Partial<SyncOptions> = {}) {
  const store = new MemoryDiskStore();
  await store.write(['Users', 'me', 'Desktop', 'note.txt'], text('hello'));
  await store.mkdir(['Users', 'me', 'Documents']);
  await store.write(['Applications', 'Notes.app', 'Contents', 'Info.plist'], text('<plist/>'));
  const vm = new FakeVm();
  await vm.write('/Users/stale.txt', text('left over from a previous VM session'));
  await vm.write('/home/user/.cache/npm/x', text('cache'));
  const sync = new DiskVmSync(access(store), vm, {
    roots: ['Applications', 'Users'],
    ignore: name => name === 'node_modules',
    ...options
  });
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

describe('DiskVmSync 否决终端的改动（预装应用保护）', () => {
  const PROTECTED = '/Applications/Notes.app/Contents/Info.plist';
  const reason = 'The item “Notes.app” can’t be removed because it’s part of a preinstalled application.';

  /** 只否决落在预装包上的改动，原因按改动类型区分，便于断言收到了什么。 */
  const guard = () =>
    vi.fn((path: readonly string[], change: PulledChange): string | null =>
      path[0] === 'Applications' && path[1] === 'Notes.app' ? `${reason} [${change}]` : null
    );

  it('终端里删掉预装包：磁盘上的包不变，虚拟机里的包被恢复，用户被告知原因', async () => {
    const veto = guard();
    const onVetoed = vi.fn();
    const { store, vm, sync } = await setup({ veto, onVetoed });

    await vm.remove('/Applications/Notes.app');
    expect(vm.files.has(PROTECTED)).toBe(false);
    expect(await sync.pull()).toBe(true);

    expect(veto).toHaveBeenCalledWith(['Applications', 'Notes.app'], 'remove');
    expect(await store.kindOf(['Applications', 'Notes.app', 'Contents', 'Info.plist'])).toBe('file');
    expect(decode(await vm.read(PROTECTED))).toBe('<plist/>');
    expect(onVetoed).toHaveBeenCalledExactlyOnceWith([`${reason} [remove]`]);
    expect(await sync.pull()).toBe(false);
  });

  it('终端里改写受保护的文件：不落盘，虚拟机里的内容恢复成磁盘上的', async () => {
    const veto = guard();
    const onVetoed = vi.fn();
    const { store, vm, sync } = await setup({ veto, onVetoed });

    await vm.write(PROTECTED, text('tampered in the terminal'));
    expect(await sync.pull()).toBe(true);

    expect(veto).toHaveBeenCalledWith(['Applications', 'Notes.app', 'Contents', 'Info.plist'], 'write');
    expect(decode(await store.read(['Applications', 'Notes.app', 'Contents', 'Info.plist']))).toBe('<plist/>');
    expect(decode(await vm.read(PROTECTED))).toBe('<plist/>');
    expect(onVetoed).toHaveBeenCalledTimes(1);
    expect(await sync.pull()).toBe(false);
  });

  it('同一次扫描里被放行的改动照常落盘，被否决的才撤销；原因去重后只通知一次', async () => {
    const veto = guard();
    const onVetoed = vi.fn();
    const { store, vm, sync } = await setup({ veto, onVetoed });

    await vm.write('/Users/me/Desktop/new.txt', text('allowed'));
    await vm.write(PROTECTED, text('tampered'));
    await vm.write('/Applications/Notes.app/Contents/PkgInfo', text('tampered too'));
    expect(await sync.pull()).toBe(true);

    expect(decode(await store.read(['Users', 'me', 'Desktop', 'new.txt']))).toBe('allowed');
    expect(decode(await store.read(['Applications', 'Notes.app', 'Contents', 'Info.plist']))).toBe('<plist/>');
    expect(onVetoed).toHaveBeenCalledTimes(1);
    expect(onVetoed.mock.calls[0][0]).toEqual([`${reason} [write]`]);
  });

  it('没有被否决的改动时不通知', async () => {
    const onVetoed = vi.fn();
    const { vm, sync } = await setup({ veto: guard(), onVetoed });
    await vm.write('/Users/me/Desktop/new.txt', text('allowed'));
    expect(await sync.pull()).toBe(true);
    expect(onVetoed).not.toHaveBeenCalled();
  });

  it('没有配置 veto 时，终端的改动一律写回（原有行为）', async () => {
    const { store, vm, sync } = await setup();
    await vm.remove('/Applications/Notes.app');
    expect(await sync.pull()).toBe(true);
    expect(await store.kindOf(['Applications', 'Notes.app'])).toBeNull();
  });
});

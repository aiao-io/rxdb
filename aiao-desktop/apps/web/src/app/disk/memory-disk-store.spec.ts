import { describe, expect, it } from 'vitest';

import { DiskError } from './disk-store';
import { MemoryDiskStore } from './memory-disk-store';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('MemoryDiskStore', () => {
  it('写文件时补齐父目录，列目录返回名字与类型', async () => {
    const store = new MemoryDiskStore(() => 1_000);
    await store.write(['Users', 'a', 'note.txt'], text('hi'));
    await store.mkdir(['Users', 'a', 'Empty']);
    expect(await store.list(['Users', 'a'])).toEqual([
      { name: 'Empty', kind: 'directory' },
      { name: 'note.txt', kind: 'file' }
    ]);
    expect(await store.info(['Users', 'a', 'note.txt'])).toEqual({ size: 2, modified: 1_000 });
    expect(new TextDecoder().decode(await store.read(['Users', 'a', 'note.txt']))).toBe('hi');
  });

  it('kindOf 对不存在的路径返回 null，读不存在的文件抛 ENOENT', async () => {
    const store = new MemoryDiskStore();
    await store.mkdir(['A']);
    expect(await store.kindOf([])).toBe('directory');
    expect(await store.kindOf(['A'])).toBe('directory');
    expect(await store.kindOf(['A', 'missing'])).toBeNull();
    await expect(store.read(['A', 'missing'])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.list(['missing'])).rejects.toBeInstanceOf(DiskError);
  });

  it('remove 递归删除，路径不存在时什么也不做', async () => {
    const store = new MemoryDiskStore();
    await store.write(['A', 'B', 'c.txt'], text('c'));
    await store.remove(['A']);
    await store.remove(['nope']);
    expect(await store.list([])).toEqual([]);
  });

  it('move 保留文件的修改时间，可以移动整个目录', async () => {
    let now = 10;
    const store = new MemoryDiskStore(() => now);
    await store.write(['Docs', 'draft.md'], text('draft'));
    now = 99;
    await store.move(['Docs'], ['Trash', 'Docs']);
    expect(await store.kindOf(['Docs'])).toBeNull();
    expect(await store.info(['Trash', 'Docs', 'draft.md'])).toEqual({ size: 5, modified: 10 });
  });

  it('move 的目标已存在时抛 EEXIST', async () => {
    const store = new MemoryDiskStore();
    await store.write(['a.txt'], text('a'));
    await store.write(['b.txt'], text('b'));
    await expect(store.move(['a.txt'], ['b.txt'])).rejects.toMatchObject({ code: 'EEXIST' });
  });
});

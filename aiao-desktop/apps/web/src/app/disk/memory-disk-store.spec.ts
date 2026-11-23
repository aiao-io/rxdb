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

  it('replace 只覆盖已有文件：更新内容与修改时间，不创建文件、不补建父目录', async () => {
    let now = 10;
    const store = new MemoryDiskStore(() => now);
    await store.write(['Docs', 'a.txt'], text('v1'));
    now = 50;

    await store.replace(['Docs', 'a.txt'], text('version two'));
    expect(new TextDecoder().decode(await store.read(['Docs', 'a.txt']))).toBe('version two');
    expect(await store.info(['Docs', 'a.txt'])).toEqual({ size: 11, modified: 50 });

    await expect(store.replace(['Docs', 'ghost.txt'], text('x'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.replace(['Gone', 'deep.txt'], text('x'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await store.list(['Docs'])).toEqual([{ name: 'a.txt', kind: 'file' }]);
    expect(await store.kindOf(['Gone'])).toBeNull();
  });

  it('replace 的目标是目录抛 EISDIR，卷根抛 EACCES', async () => {
    const store = new MemoryDiskStore();
    await store.mkdir(['Docs']);
    await expect(store.replace(['Docs'], text('x'))).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(store.replace([], text('x'))).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('move 的目标已存在时抛 EEXIST', async () => {
    const store = new MemoryDiskStore();
    await store.write(['a.txt'], text('a'));
    await store.write(['b.txt'], text('b'));
    await expect(store.move(['a.txt'], ['b.txt'])).rejects.toMatchObject({ code: 'EEXIST' });
  });

  describe('大小写变体（与生产的唯一索引同口径）', () => {
    const taken = (existing: string) => ({ code: 'EEXIST', message: expect.stringContaining(`“${existing}”`) });

    it('新建一个只在大小写上和同级已有名字不同的文件：抛 EEXIST 并说清是哪个名字，已有文件原样', async () => {
      const store = new MemoryDiskStore();
      await store.write(['Docs', 'Report.txt'], text('original'));

      const failure = await store.write(['Docs', 'report.txt'], text('new')).then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).toBeInstanceOf(DiskError);
      expect(failure).toMatchObject(taken('Report.txt'));
      expect(await store.list(['Docs'])).toEqual([{ name: 'Report.txt', kind: 'file' }]);
      expect(new TextDecoder().decode(await store.read(['Docs', 'Report.txt']))).toBe('original');

      await store.write(['Docs', 'Report.txt'], text('v2'));
      expect(new TextDecoder().decode(await store.read(['Docs', 'Report.txt']))).toBe('v2');
    });

    it('路径查找保持精确：换一种大小写就是另一条路径', async () => {
      const store = new MemoryDiskStore();
      await store.write(['Docs', 'Report.txt'], text('original'));
      expect(await store.kindOf(['Docs', 'report.txt'])).toBeNull();
      expect(await store.kindOf(['docs'])).toBeNull();
      await expect(store.read(['Docs', 'report.txt'])).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(store.replace(['Docs', 'report.txt'], text('x'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('mkdir 与逐级补建目录：同级有只差大小写的目录或文件就抛 EEXIST，什么也不建', async () => {
      const store = new MemoryDiskStore();
      await store.write(['Docs', 'a.txt'], text('a'));
      await store.write(['Notes'], text('a file'));

      await expect(store.mkdir(['docs'])).rejects.toMatchObject(taken('Docs'));
      await expect(store.mkdir(['notes'])).rejects.toMatchObject(taken('Notes'));
      await expect(store.write(['DOCS', 'b.txt'], text('b'))).rejects.toMatchObject(taken('Docs'));
      await expect(store.move(['Notes'], ['docs', 'Notes'])).rejects.toMatchObject(taken('Docs'));
      expect(await store.list([])).toEqual([
        { name: 'Docs', kind: 'directory' },
        { name: 'Notes', kind: 'file' }
      ]);
      await store.mkdir(['Docs']);
      expect(await store.list(['Docs'])).toEqual([{ name: 'a.txt', kind: 'file' }]);
    });

    it('move 的目标和同级另一个节点只差大小写：EEXIST，源不动；换到别的目录同理', async () => {
      const store = new MemoryDiskStore();
      await store.write(['Docs', 'Report.txt'], text('report'));
      await store.write(['Docs', 'notes.txt'], text('notes'));
      await store.write(['Other', 'x.txt'], text('x'));

      await expect(store.move(['Docs', 'notes.txt'], ['Docs', 'REPORT.TXT'])).rejects.toMatchObject(
        taken('Report.txt')
      );
      await expect(store.move(['Other', 'x.txt'], ['Docs', 'report.txt'])).rejects.toMatchObject(taken('Report.txt'));
      expect((await store.list(['Docs'])).map(entry => entry.name)).toEqual(['notes.txt', 'Report.txt']);
      expect((await store.list(['Other'])).map(entry => entry.name)).toEqual(['x.txt']);
    });

    it('纯大小写改名（同一个节点）可以：内容与修改时间不变；目录的子项跟着走', async () => {
      let now = 10;
      const store = new MemoryDiskStore(() => now);
      await store.write(['Docs', 'Report.txt'], text('report'));
      now = 99;

      await store.move(['Docs', 'Report.txt'], ['Docs', 'report.txt']);
      expect(await store.list(['Docs'])).toEqual([{ name: 'report.txt', kind: 'file' }]);
      expect(await store.info(['Docs', 'report.txt'])).toEqual({ size: 6, modified: 10 });

      await store.move(['Docs'], ['docs']);
      expect(await store.list([])).toEqual([{ name: 'docs', kind: 'directory' }]);
      expect(new TextDecoder().decode(await store.read(['docs', 'report.txt']))).toBe('report');
    });
  });
});

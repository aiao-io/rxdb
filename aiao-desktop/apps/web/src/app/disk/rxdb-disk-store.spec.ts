import { describe, expect, it, vi } from 'vitest';

import { FakeDesktopData } from '../testing/fake-desktop-data';
import { DesktopFile } from './desktop-file.entity';
import { DiskError } from './disk-store';
import { BLOB_DIR, RxdbDiskStore } from './rxdb-disk-store';

interface FileRow {
  id?: string;
  name: string;
  type: 'file' | 'folder';
  parentId?: string | null;
  size: number;
  mimeType: string | null;
  contentId: string | null;
  modifiedAt: Date;
}

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

function setup() {
  const data = new FakeDesktopData();
  const files = data.table<FileRow>(DesktopFile);
  let clock = 1000;
  const store = new RxdbDiskStore({
    repository: () => data.repository(DesktopFile) as never,
    instantiate: fields => data.instantiate(DesktopFile, fields) as never,
    storage: () => data.storage as never,
    now: () => clock++
  });
  return { store, files, storage: data.storage };
}

const names = async (store: RxdbDiskStore, dir: string[]): Promise<string[]> =>
  (await store.list(dir)).map(entry => entry.name).sort();

describe('RxdbDiskStore 写入与读取', () => {
  it('写文件时补齐父目录，文件体交给 storage 插件，元数据落在文件行上', async () => {
    const { store, files, storage } = setup();
    await store.write(['Users', 'me', 'note.txt'], text('hello'));

    expect(await names(store, [])).toEqual(['Users']);
    expect(await store.list(['Users', 'me'])).toEqual([{ name: 'note.txt', kind: 'file' }]);
    expect(decode(await store.read(['Users', 'me', 'note.txt']))).toBe('hello');
    expect(await store.info(['Users', 'me', 'note.txt'])).toEqual({ size: 5, modified: 1002 });

    const row = files.rows.find(item => item.name === 'note.txt');
    expect(row).toMatchObject({ type: 'file', size: 5, mimeType: 'text/plain' });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.calls[0][1]).toEqual({ path: BLOB_DIR });
    expect(storage.blobs.size).toBe(1);
  });

  it('覆盖写入替换内容和修改时间，旧文件体被释放', async () => {
    const { store, storage } = setup();
    await store.write(['a.md'], text('v1'));
    const firstModified = (await store.info(['a.md'])).modified;
    await store.write(['a.md'], text('version two'));

    expect(decode(await store.read(['a.md']))).toBe('version two');
    expect((await store.info(['a.md'])).modified).toBeGreaterThan(firstModified);
    expect(storage.blobs.size).toBe(1);
    expect(await names(store, [])).toEqual(['a.md']);
  });

  it('没有文件体的文件行（空文件）读出来是空字节', async () => {
    const { store, files } = setup();
    files.seed([
      { name: 'empty', type: 'file', parentId: null, size: 0, mimeType: null, contentId: null, modifiedAt: new Date(5) }
    ]);
    expect(await store.read(['empty'])).toEqual(new Uint8Array(0));
    expect(await store.info(['empty'])).toEqual({ size: 0, modified: 5 });
  });

  it('写入失败时撤回刚上传的文件体，不留孤儿，也不改动原有内容', async () => {
    const { store, files, storage } = setup();
    await store.write(['a.txt'], text('keep'));
    const before = storage.blobs.size;
    vi.spyOn(files, 'update').mockRejectedValueOnce(new Error('db error'));

    await expect(store.write(['a.txt'], text('lost'))).rejects.toThrow('db error');
    expect(storage.blobs.size).toBe(before);
    expect(decode(await store.read(['a.txt']))).toBe('keep');

    vi.spyOn(files, 'create').mockRejectedValueOnce(new Error('insert failed'));
    await expect(store.write(['b.txt'], text('new'))).rejects.toThrow('insert failed');
    expect(storage.blobs.size).toBe(before);
    expect(await store.kindOf(['b.txt'])).toBeNull();
  });

  it('文件夹和文件的冲突：不能把文件写到文件夹上，也不能把文件当目录用', async () => {
    const { store } = setup();
    await store.mkdir(['Docs']);
    await store.write(['a.txt'], text('a'));

    await expect(store.write(['Docs'], text('x'))).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(store.write(['a.txt', 'inner.txt'], text('x'))).rejects.toMatchObject({ code: 'ENOTDIR' });
    await expect(store.mkdir(['a.txt', 'sub'])).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('卷根本身不能当文件写', async () => {
    const { store } = setup();
    await expect(store.write([], text('x'))).rejects.toMatchObject({
      code: 'EACCES',
      message: 'Macintosh HD itself cannot be changed'
    });
  });

  it('读不存在的文件报 ENOENT，读目录报 EISDIR', async () => {
    const { store } = setup();
    await store.mkdir(['Docs']);
    await expect(store.read(['ghost'])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.info(['ghost'])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.read(['Docs'])).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(store.info(['Docs'])).rejects.toBeInstanceOf(DiskError);
  });
});

describe('RxdbDiskStore 目录', () => {
  it('kindOf：卷根是目录，不存在的路径为 null', async () => {
    const { store } = setup();
    await store.write(['Docs', 'a.txt'], text('a'));
    expect(await store.kindOf([])).toBe('directory');
    expect(await store.kindOf(['Docs'])).toBe('directory');
    expect(await store.kindOf(['Docs', 'a.txt'])).toBe('file');
    expect(await store.kindOf(['Docs', 'ghost'])).toBeNull();
  });

  it('mkdir 递归创建，重复创建什么也不改', async () => {
    const { store, files } = setup();
    await store.mkdir(['A', 'B', 'C']);
    await store.mkdir(['A', 'B', 'C']);
    await store.mkdir([]);
    expect(files.rows.filter(row => row.type === 'folder')).toHaveLength(3);
    expect(await names(store, ['A', 'B'])).toEqual(['C']);
  });

  it('list 目录不存在报 ENOENT，列一个文件报 ENOTDIR', async () => {
    const { store } = setup();
    await store.write(['a.txt'], text('a'));
    await expect(store.list(['ghost'])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.list(['a.txt'])).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('remove 递归删除整棵子树，释放所有文件体；路径不存在时什么也不做', async () => {
    const { store, storage } = setup();
    await store.write(['Docs', 'a.txt'], text('a'));
    await store.write(['Docs', 'deep', 'b.txt'], text('b'));
    await store.write(['keep.txt'], text('k'));
    expect(storage.blobs.size).toBe(3);

    await store.remove(['Docs']);
    await store.remove(['ghost']);
    expect(await names(store, [])).toEqual(['keep.txt']);
    expect(await store.kindOf(['Docs', 'a.txt'])).toBeNull();
    expect(storage.blobs.size).toBe(1);
  });
});

describe('RxdbDiskStore 移动与改名', () => {
  it('改名保留内容与修改时间，文件体不动', async () => {
    const { store, storage } = setup();
    await store.write(['a.txt'], text('a'));
    const modified = (await store.info(['a.txt'])).modified;
    const uploads = storage.upload.mock.calls.length;

    await store.move(['a.txt'], ['b.txt']);
    expect(await names(store, [])).toEqual(['b.txt']);
    expect(await store.info(['b.txt'])).toEqual({ size: 1, modified });
    expect(storage.upload.mock.calls.length).toBe(uploads);
  });

  it('移动整个目录：子项跟着走；目标的父目录不存在时补建', async () => {
    const { store } = setup();
    await store.write(['Docs', 'a.txt'], text('a'));
    await store.write(['Docs', 'deep', 'b.txt'], text('b'));

    await store.move(['Docs'], ['Archive', '2026', 'Docs']);
    expect(await store.kindOf(['Docs'])).toBeNull();
    expect(decode(await store.read(['Archive', '2026', 'Docs', 'deep', 'b.txt']))).toBe('b');
    expect(await names(store, ['Archive', '2026', 'Docs'])).toEqual(['a.txt', 'deep']);
  });

  it('目标已存在报 EEXIST，源不存在报 ENOENT，不能把目录移进它自己', async () => {
    const { store } = setup();
    await store.write(['a.txt'], text('a'));
    await store.write(['b.txt'], text('b'));
    await store.mkdir(['Docs', 'sub']);

    await expect(store.move(['a.txt'], ['b.txt'])).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(store.move(['ghost'], ['x'])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.move(['Docs'], ['Docs', 'sub', 'Docs'])).rejects.toMatchObject({
      code: 'EACCES',
      message: '“Docs” can’t be moved into itself.'
    });
    expect(await names(store, [])).toEqual(['Docs', 'a.txt', 'b.txt']);
  });
});

describe('RxdbDiskStore 内存索引', () => {
  it('第一次用到时整表读一次，之后都走索引', async () => {
    const { store, files } = setup();
    await store.write(['a.txt'], text('a'));
    await store.write(['b.txt'], text('b'));
    await store.list([]);
    expect(files.find).toHaveBeenCalledTimes(1);
  });

  it('invalidate 之后重新读库：外部对文件行的改动才看得见', async () => {
    const { store, files } = setup();
    await store.write(['a.txt'], text('a'));
    files.seed([
      {
        name: 'outside',
        type: 'file',
        parentId: null,
        size: 0,
        mimeType: null,
        contentId: null,
        modifiedAt: new Date(1)
      }
    ]);
    expect(await names(store, [])).toEqual(['a.txt']);

    store.invalidate();
    expect(await names(store, [])).toEqual(['a.txt', 'outside']);
    expect(files.find).toHaveBeenCalledTimes(2);
  });
});

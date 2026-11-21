import { describe, expect, it, vi } from 'vitest';

import type { DiskBatchRecord } from './disk-batch';
import { DESKTOP, TRASH, type DiskPath } from './disk-path';
import {
  MAX_IMPORT_BYTES,
  copyEntryTo as copyToWithJournal,
  duplicateEntry as duplicateWithJournal,
  importFiles as importWithJournal,
  moveEntryTo,
  renameEntry,
  restoreEntry,
  validateImportSize,
  validateName,
  type ImportedFile
} from './file-operations';
import { MemoryDiskStore } from './memory-disk-store';

const journal = () => {
  let value: DiskBatchRecord | null = null;
  return {
    read: async () => value,
    write: async (record: DiskBatchRecord) => {
      value = record;
    },
    clear: async () => {
      value = null;
    }
  };
};
const duplicateEntry = (store: MemoryDiskStore, path: DiskPath) => duplicateWithJournal(store, path, journal());
const copyEntryTo = (store: MemoryDiskStore, from: DiskPath, dir: DiskPath) =>
  copyToWithJournal(store, from, dir, journal());
const importFiles = (store: MemoryDiskStore, path: DiskPath, files: readonly ImportedFile[]) =>
  importWithJournal(store, path, files, journal());

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const note = [...DESKTOP, 'note.txt'];

const setup = async () => {
  const store = new MemoryDiskStore();
  await store.write(note, bytes('original'));
  return store;
};

describe('Finder 文件操作', () => {
  it('批量导入在读取文件前校验总大小，边界可用，超限和无效大小拒绝', () => {
    expect(() => validateImportSize([0, MAX_IMPORT_BYTES])).not.toThrow();
    for (const sizes of [[MAX_IMPORT_BYTES, 1], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])
      expect(() => validateImportSize(sizes)).toThrow();
  });

  it('拒绝空名称、路径分隔符、控制字符和相对路径，允许中文与 emoji', () => {
    for (const name of ['', ' ', '.', '..', 'a/b', 'a\\b', 'a\0b', 'a\nb']) expect(() => validateName(name)).toThrow();
    expect(validateName(' 文档 🌏.txt ')).toBe(' 文档 🌏.txt ');
  });

  it('改名保持正文，同名不写入，目标存在时不覆盖', async () => {
    const store = await setup();
    await expect(renameEntry(store, note, 'note.txt')).resolves.toEqual(note);
    const renamed = await renameEntry(store, note, '新名.txt');
    expect(await store.read(renamed)).toEqual(bytes('original'));
    expect(await store.kindOf(note)).toBeNull();
    await store.write(note, bytes('other'));
    await expect(renameEntry(store, renamed, 'note.txt')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await store.read(renamed)).toEqual(bytes('original'));
    expect(await store.read(note)).toEqual(bytes('other'));
  });

  it('复制嵌套目录、二进制、空文件和空目录，连续复制自动取不同名称', async () => {
    const store = await setup();
    const dir = [...DESKTOP, 'project'];
    await store.write([...dir, 'sub', 'bytes.bin'], new Uint8Array([0, 255, 128]));
    await store.write([...dir, 'empty'], new Uint8Array());
    await store.mkdir([...dir, 'blank']);
    const copy = await duplicateEntry(store, dir);
    const second = await duplicateEntry(store, dir);
    expect(copy).toEqual([...DESKTOP, 'project copy']);
    expect(second).toEqual([...DESKTOP, 'project copy 2']);
    expect(await store.read([...copy, 'sub', 'bytes.bin'])).toEqual(new Uint8Array([0, 255, 128]));
    expect(await store.read([...copy, 'empty'])).toHaveLength(0);
    expect(await store.list([...copy, 'blank'])).toEqual([]);
    await store.write([...copy, 'empty'], bytes('changed'));
    expect(await store.read([...dir, 'empty'])).toHaveLength(0);
    expect(await duplicateEntry(store, note)).toEqual([...DESKTOP, 'note copy.txt']);
  });

  it('复制和移动文件夹到目标目录时保留内容、处理重名并拒绝进入自身', async () => {
    const store = await setup();
    const source = [...DESKTOP, 'folder'];
    const target = [...DESKTOP, 'target'];
    await store.write([...source, 'child.txt'], bytes('child'));
    await store.mkdir(target);

    const copy = await copyEntryTo(store, source, target);
    expect(copy).toEqual([...target, 'folder']);
    expect(await store.read([...copy, 'child.txt'])).toEqual(bytes('child'));
    const moved = await moveEntryTo(store, note, target);
    expect(moved).toEqual([...target, 'note.txt']);
    expect(await store.kindOf(note)).toBeNull();
    await expect(copyEntryTo(store, source, source)).rejects.toMatchObject({ code: 'EACCES' });
    await expect(moveEntryTo(store, source, source)).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('复制写入失败撤回不完整目标，源文件保持不变', async () => {
    const store = await setup();
    await store.mkdir([...DESKTOP, 'tree']);
    await store.write([...DESKTOP, 'tree', 'a'], bytes('a'));
    await store.write([...DESKTOP, 'tree', 'b'], bytes('b'));
    vi.spyOn(store, 'write')
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(new Error('quota'));
    await expect(duplicateEntry(store, [...DESKTOP, 'tree'])).rejects.toThrow('quota');
    expect(await store.kindOf([...DESKTOP, 'tree copy'])).toBeNull();
    expect(await store.read([...DESKTOP, 'tree', 'b'])).toEqual(bytes('b'));
  });

  it('导入不覆盖同名文件，并保留零字节文件与二进制', async () => {
    const store = await setup();
    const imported = await importFiles(store, DESKTOP, [
      { name: 'note.txt', data: bytes('import') },
      { name: 'note.txt', data: new Uint8Array() },
      { name: 'image.bin', data: new Uint8Array([0, 255]) }
    ]);
    expect(imported.map(path => path.at(-1))).toEqual(['note 2.txt', 'note 3.txt', 'image.bin']);
    expect(await store.read(note)).toEqual(bytes('original'));
    expect(await store.read(imported[1])).toHaveLength(0);
    expect(await store.read(imported[2])).toEqual(new Uint8Array([0, 255]));
  });

  it('导入前验证整批名称和父目录，失败不留下前半批文件', async () => {
    const store = await setup();
    await expect(
      importFiles(store, DESKTOP, [
        { name: 'ok', data: bytes('a') },
        { name: '../bad', data: bytes('b') }
      ])
    ).rejects.toThrow();
    expect(await store.kindOf([...DESKTOP, 'ok'])).toBeNull();
    await expect(importFiles(store, ['missing'], [{ name: 'ok', data: bytes('a') }])).rejects.toMatchObject({
      code: 'ENOENT'
    });
    vi.spyOn(store, 'write')
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(new Error('full'));
    await expect(
      importFiles(store, DESKTOP, [
        { name: 'a', data: bytes('a') },
        { name: 'b', data: bytes('b') }
      ])
    ).rejects.toThrow('full');
    expect(await store.kindOf([...DESKTOP, 'a'])).toBeNull();
    expect(await store.read(note)).toEqual(bytes('original'));
  });

  it('废纸篓原位置随改名保留；恢复时自动处理同名，正文不覆盖', async () => {
    const store = await setup();
    const trashed = [...TRASH, 'note.txt'];
    await store.move(note, trashed);
    const renamed = await renameEntry(store, trashed, 'renamed.txt');
    await store.write(note, bytes('new'));
    const restored = await restoreEntry(store, renamed);
    expect(restored).toEqual([...DESKTOP, 'note 2.txt']);
    expect(await store.read(restored)).toEqual(bytes('original'));
    expect(await store.read(note)).toEqual(bytes('new'));
    expect((await store.list(DESKTOP)).find(item => item.name === 'note 2.txt')?.originalPath).toBeUndefined();
  });

  it('原目录失效保留废纸篓条目，允许用户明确选择现存目录', async () => {
    const store = await setup();
    const original = [...DESKTOP, 'parent', 'file.txt'];
    await store.write(original, bytes('keep'));
    const trashed = [...TRASH, 'file.txt'];
    await store.move(original, trashed);
    await store.remove([...DESKTOP, 'parent']);
    await expect(restoreEntry(store, trashed)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await store.read(trashed)).toEqual(bytes('keep'));
    expect(await restoreEntry(store, trashed, DESKTOP)).toEqual([...DESKTOP, 'file.txt']);
  });

  it('旧废纸篓没有原位置时要求明确目录，拒绝恢复到废纸篓', async () => {
    const store = await setup();
    const old = [...TRASH, 'old.txt'];
    await store.write(old, bytes('old'));
    await expect(restoreEntry(store, old)).rejects.toThrow('original location');
    await expect(restoreEntry(store, old, TRASH)).rejects.toMatchObject({ code: 'EACCES' });
    expect(await restoreEntry(store, old, DESKTOP)).toEqual([...DESKTOP, 'old.txt']);
    await expect(restoreEntry(store, note)).rejects.toMatchObject({ code: 'EACCES' });
    await expect(duplicateEntry(store, [...DESKTOP, 'missing'])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

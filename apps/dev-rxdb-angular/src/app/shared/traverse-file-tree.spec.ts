import { describe, expect, it, vi } from 'vitest';
import { traverseFileTree } from './traverse-file-tree';

const makeFileEntry = (
  name: string,
  file: File | null,
  failure?: DOMException
): FileSystemFileEntry & FileSystemEntry =>
  ({
    name,
    isFile: true,
    isDirectory: false,
    file: vi.fn((success: (f: File) => void, error?: (e: DOMException) => void) => {
      if (failure) {
        error?.(failure);
        return;
      }
      success(file as File);
    })
  }) as unknown as FileSystemFileEntry & FileSystemEntry;

const makeDirectoryEntry = (name: string, batches: FileSystemEntry[][]): FileSystemEntry =>
  ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () =>
      ({
        readEntries: vi.fn((success: FileSystemEntriesCallback) => success(batches.shift() ?? []))
      }) as unknown as FileSystemDirectoryReader
  }) as unknown as FileSystemEntry;

describe('traverseFileTree', () => {
  it('收集文件并写入相对路径', async () => {
    const file = new File(['x'], 'a.txt');
    const files: File[] = [];

    await traverseFileTree(makeFileEntry('a.txt', file), 'docs/', files);

    expect(files).toHaveLength(1);
    expect(files[0].webkitRelativePath).toBe('docs/a.txt');
  });

  it('递归目录并按层级拼路径', async () => {
    const inner = makeFileEntry('b.txt', new File(['y'], 'b.txt'));
    const dir = makeDirectoryEntry('sub', [[inner], []]);
    const files: File[] = [];

    await traverseFileTree(dir, '', files);

    expect(files.map(f => f.webkitRelativePath)).toEqual(['sub/b.txt']);
  });

  /**
   * P0-2 的核心：`entry.file()` 的 error callback 一旦缺失，这个 Promise 既不 resolve 也不 reject，
   * 外层 `Promise.all` **永久 pending** —— 上传界面停在"处理中"，没有任何错误、也没有超时。
   */
  it('文件读取失败必须 reject，而不是永久 pending', async () => {
    const denied = new DOMException('permission denied');
    const files: File[] = [];

    await expect(traverseFileTree(makeFileEntry('a.txt', null, denied), '', files)).rejects.toBe(denied);
  });

  it('目录读取失败必须 reject', async () => {
    const denied = new DOMException('read failed');
    const dir = {
      name: 'sub',
      isFile: false,
      isDirectory: true,
      createReader: () =>
        ({
          readEntries: vi.fn((_success: FileSystemEntriesCallback, error?: ErrorCallback) => error?.(denied))
        }) as unknown as FileSystemDirectoryReader
    } as unknown as FileSystemEntry;

    await expect(traverseFileTree(dir, '', [])).rejects.toBe(denied);
  });

  it('既非文件也非目录的条目直接 resolve，不吞不挂', async () => {
    const other = { name: '?', isFile: false, isDirectory: false } as unknown as FileSystemEntry;
    const files: File[] = [];

    await expect(traverseFileTree(other, '', files)).resolves.toBeUndefined();
    expect(files).toHaveLength(0);
  });
});

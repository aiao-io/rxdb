import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadDatabase } from './download-database';

type Entry = [string, FileSystemFileHandle | FileSystemDirectoryHandle];

function directory(entries: Entry[]): FileSystemDirectoryHandle {
  return {
    async *entries() {
      for (const entry of entries) {
        yield entry;
      }
    },
    kind: 'directory'
  } as unknown as FileSystemDirectoryHandle;
}

/**
 * 文件替身：一个**真实的 Blob**，外加可监视的 `arrayBuffer`。
 *
 * 用真 Blob 有两个理由：
 * 1. 只有真 Blob 才能作为 `new Blob(parts)` 的 part（happy-dom 与浏览器都是）；
 * 2. `arrayBuffer` 被 spy 之后，才能断言归档过程**有没有把内容读进 JS 内存**（P0-2）。
 *
 * `size` 需要覆盖时（测超大文件）用 `Object.defineProperty` 盖掉只读属性。
 */
function file(data: Uint8Array, size?: number, arrayBuffer?: ReturnType<typeof vi.fn>): FileSystemFileHandle {
  const blob = new Blob([data as unknown as BlobPart]);
  if (arrayBuffer) {
    Object.defineProperty(blob, 'arrayBuffer', { configurable: true, value: arrayBuffer });
  } else {
    vi.spyOn(blob, 'arrayBuffer');
  }
  if (size !== undefined && size !== data.byteLength) {
    Object.defineProperty(blob, 'size', { configurable: true, value: size });
  }
  return {
    getFile: vi.fn(async () => blob),
    kind: 'file'
  } as unknown as FileSystemFileHandle;
}

function readString(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.slice(offset, offset + length);
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.slice(0, end));
}

function checksum(header: Uint8Array): number {
  return header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
}

describe('downloadDatabase', () => {
  let downloadedBlob: Blob | null;

  beforeEach(() => {
    downloadedBlob = null;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:download';
      })
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('writes long UTF-8 paths and a valid tar checksum', async () => {
    const prefix = '目录'.repeat(20);
    const name = '数据库.sqlite';
    const root = directory([[prefix, directory([[name, file(new Uint8Array([1, 2, 3]))]])]]);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => root) }
    });

    await expect(downloadDatabase('数据库')).resolves.toEqual({ success: true, fileCount: 1 });
    expect(downloadedBlob).not.toBeNull();

    const tar = new Uint8Array(await downloadedBlob!.arrayBuffer());
    const header = tar.slice(0, 512);
    expect(readString(header, 0, 100)).toBe(name);
    expect(readString(header, 345, 155)).toBe(prefix);
    expect(readString(header, 257, 6)).toBe('ustar');
    expect(Number.parseInt(readString(header, 148, 8).trim(), 8)).toBe(checksum(header));
    expect(Array.from(tar.slice(512, 515))).toEqual([1, 2, 3]);
    expect(tar.byteLength).toBe(2048);
  });

  it('rejects a path that cannot fit in an ustar header', async () => {
    const databaseName = 'x'.repeat(101);
    const fileName = `${databaseName}.sqlite`;
    const root = directory([[fileName, file(new Uint8Array([1]))]]);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => root) }
    });

    await expect(downloadDatabase(databaseName)).resolves.toEqual({
      success: false,
      error: `路径过长，无法归档: ${fileName}`
    });
  });

  it('rejects files whose size cannot fit in the tar size field', async () => {
    const read = vi.fn(async () => new ArrayBuffer(0));
    const root = directory([['huge.sqlite', file(new Uint8Array([0]), 8_589_934_592, read)]]);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => root) }
    });

    await expect(downloadDatabase('huge')).resolves.toEqual({
      success: false,
      error: '文件过大，无法归档: huge.sqlite'
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('does not create an empty archive', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => directory([])) }
    });

    await expect(downloadDatabase('demo')).resolves.toEqual({
      success: false,
      error: 'OPFS 中找不到数据库 demo 的文件'
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('只归档当前 RxDB 数据库文件，不带走同源其他 OPFS 数据', async () => {
    const root = directory([
      ['demo.sqlite', file(new Uint8Array([1]))],
      ['demo.sqlite-wal', file(new Uint8Array([2]))],
      ['other.sqlite', file(new Uint8Array([3]))],
      ['notes.txt', file(new Uint8Array([4]))],
      ['nested', directory([['demo.sqlite-journal', file(new Uint8Array([5]))]])]
    ]);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => root) }
    });
    await expect(downloadDatabase('demo')).resolves.toEqual({ success: true, fileCount: 3 });
  });
});

describe('downloadDatabase —— 内存占用（P0-2）', () => {
  let downloadedBlob: Blob | null;

  beforeEach(() => {
    downloadedBlob = null;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:download';
      })
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  /**
   * P0-2：原实现对每个文件都 `await file.arrayBuffer()` 并把结果 push 进数组，
   * 全部读完之后再 `new Uint8Array(totalLength)` **整体拷贝一遍**，最后包 Blob ——
   * 峰值内存 ≈ 数据总量 × 2 + Blob。同源 OPFS 有多大，这里就要吃多少。
   *
   * `Blob` 本来就接受 `Blob` 作为 part，浏览器会让它继续由磁盘承载。
   * 所以正确的做法是**把 File 直接放进 parts**，文件字节根本不进 JS 堆。
   */
  it('归档时不把文件内容读进内存', async () => {
    const readA = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer as ArrayBuffer);
    const readB = vi.fn(async () => new Uint8Array([4, 5]).buffer as ArrayBuffer);
    const root = directory([
      ['a.sqlite', file(new Uint8Array([1, 2, 3]), undefined, readA)],
      ['a.sqlite-wal', file(new Uint8Array([4, 5]), undefined, readB)]
    ]);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => root) }
    });

    await expect(downloadDatabase('a')).resolves.toEqual({ success: true, fileCount: 2 });

    expect(readA).not.toHaveBeenCalled();
    expect(readB).not.toHaveBeenCalled();
  });

  it('归档内容仍然正确（两个文件按 512 对齐拼接）', async () => {
    const root = directory([
      ['a.sqlite', file(new Uint8Array([1, 2, 3]))],
      ['a.sqlite-wal', file(new Uint8Array([4, 5]))]
    ]);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => root) }
    });

    await expect(downloadDatabase('a')).resolves.toEqual({ success: true, fileCount: 2 });

    const tar = new Uint8Array(await downloadedBlob!.arrayBuffer());
    // 2 个文件 × (512 头 + 512 内容块) + 1024 结束块
    expect(tar.byteLength).toBe(3072);
    expect(Array.from(tar.slice(512, 515))).toEqual([1, 2, 3]);
    expect(readString(tar.slice(1024, 1536), 0, 100)).toBe('a.sqlite-wal');
    expect(Array.from(tar.slice(1536, 1538))).toEqual([4, 5]);
  });
});

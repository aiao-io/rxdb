import { describe, expect, it, vi } from 'vitest';

import { collectDesktopBodies, matchDesktopBodies, storageInventory, writeDesktopBodies } from './desktop-storage-io';

const meta = { id: 'file', opfsPath: 'blobs/test', size: 3 };
const body = { path: ['blobs', 'test'], blob: new Blob([new Uint8Array([0, 255, 128])]) };

describe('备份文件体 I/O', () => {
  it('复制校验后的原始字节，并在读取前限制总量', async () => {
    const source = { listAllMetas: async () => [meta], read: vi.fn(async () => body.blob) };
    const result = await collectDesktopBodies(source, 3);
    expect(new Uint8Array(await result.files[0].blob.arrayBuffer())).toEqual(new Uint8Array([0, 255, 128]));
    expect(result.metas).toEqual([meta]);
    source.read.mockClear();
    await expect(collectDesktopBodies(source, 2)).rejects.toThrow('256 MiB');
    expect(source.read).not.toHaveBeenCalled();
    source.read.mockResolvedValueOnce(new Blob());
    await expect(collectDesktopBodies(source, 3)).rejects.toThrow('size');
    source.read.mockRejectedValueOnce(new Error('unavailable'));
    await expect(collectDesktopBodies(source, 3)).rejects.toThrow('unavailable');
  });

  it('恢复文件列表必须与数据库元数据完全相同，拒绝少体、多体、重名、大小漂移', () => {
    expect(() => matchDesktopBodies([meta], [body])).not.toThrow();
    for (const bodies of [[], [body, body], [{ ...body, path: ['elsewhere'] }], [{ ...body, blob: new Blob() }]])
      expect(() => matchDesktopBodies([meta], bodies)).toThrow();
    expect(() => matchDesktopBodies([meta, meta], [body, body])).toThrow();
  });

  it('逐个文件完成写入；失败时丢弃未提交内容并传播原错误', async () => {
    const writer = {
      write: vi.fn<(data: Blob) => Promise<void>>(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn<(error: unknown) => Promise<void>>(async () => undefined)
    };
    const filesystem = { openWrite: vi.fn<(path: string) => Promise<typeof writer>>(async () => writer) };
    await writeDesktopBodies(filesystem, [body]);
    expect(filesystem.openWrite).toHaveBeenCalledWith('blobs/test');
    expect(writer.close).toHaveBeenCalledOnce();
    writer.write.mockRejectedValueOnce(new Error('quota'));
    await expect(writeDesktopBodies(filesystem, [body])).rejects.toThrow('quota');
    expect(writer.abort).toHaveBeenCalledOnce();
    expect(writer.close).toHaveBeenCalledOnce();
  });

  it('真实枚举子目录和大小，读取失败不能被当成空目录', async () => {
    const filesystem = {
      list: async function* (path: string) {
        if (path === '/') yield { name: 'blobs', kind: 'directory' as const };
        else yield { name: 'test', kind: 'file' as const };
      },
      readBlob: vi.fn<(path: string) => Promise<Blob>>(async () => body.blob)
    };
    expect(await storageInventory(filesystem)).toEqual([{ path: 'blobs/test', size: 3 }]);
    filesystem.readBlob.mockRejectedValueOnce(new Error('OPFS unavailable'));
    await expect(storageInventory(filesystem)).rejects.toThrow('OPFS unavailable');
  });
});

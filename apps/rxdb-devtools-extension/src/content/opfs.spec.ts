import { describe, expect, it, vi } from 'vitest';
import { MAX_OPFS_UPLOAD_BYTES } from '@aiao/rxdb-devtools-panel/wire';
import { createOpfsMessageHandler } from './opfs';

interface MockDirectory {
  handle: FileSystemDirectoryHandle;
  removeEntry: ReturnType<typeof vi.fn>;
}

function createDirectory(children: Record<string, FileSystemHandle> = {}, name = 'directory'): MockDirectory {
  const removeEntry = vi.fn(async (name: string) => {
    if (!children[name]) throw new DOMException('Missing', 'NotFoundError');
    delete children[name];
  });
  const handle = {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const entry of Object.entries(children)) yield entry;
    },
    getDirectoryHandle: vi.fn(async (childName: string, options?: FileSystemGetDirectoryOptions) => {
      const child = children[childName];
      if (child?.kind === 'directory') return child as FileSystemDirectoryHandle;
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
      const created = createDirectory({}, childName).handle;
      children[childName] = created;
      return created;
    }),
    getFileHandle: vi.fn(async (name: string) => {
      const child = children[name];
      if (child?.kind !== 'file') throw new DOMException('Missing', 'NotFoundError');
      return child as FileSystemFileHandle;
    }),
    removeEntry
  } as unknown as FileSystemDirectoryHandle;
  return { handle, removeEntry };
}

function createFile(name: string, contents = 'data') {
  const write = vi.fn<(data: FileSystemWriteChunkType) => Promise<void>>().mockResolvedValue(undefined);
  const close = vi.fn(async () => undefined);
  const abort = vi.fn(async () => undefined);
  const handle = {
    kind: 'file',
    name,
    getFile: vi.fn(async () => new File([contents], name, { type: 'application/octet-stream', lastModified: 42 })),
    createWritable: vi.fn(async () => ({ write, close, abort }))
  } as unknown as FileSystemFileHandle;
  return { handle, write, close, abort };
}

describe('createOpfsMessageHandler', () => {
  it('reads a fresh recursive directory structure', async () => {
    const file = createFile('data.sqlite', 'abc');
    const nested = createDirectory({ 'data.sqlite': file.handle }, 'nested');
    const root = createDirectory({ nested: nested.handle }, 'root');
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    const response = await handler({ requestId: 'read-1', message: 'getDirectoryStructure' });

    expect(response.requestId).toBe('read-1');
    expect(response.structure?.['.']?.entries?.['nested']?.entries?.['data.sqlite']).toMatchObject({
      name: 'data.sqlite',
      kind: 'file',
      size: 3,
      relativePath: './nested/data.sqlite'
    });
  });

  it('uploads bytes to a freshly resolved directory', async () => {
    const file = createFile('upload.bin');
    const nested = createDirectory({ 'upload.bin': file.handle });
    const root = createDirectory({ nested: nested.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(
      handler({
        requestId: 'upload-1',
        message: 'uploadFile',
        data: { path: '/nested', fileName: 'upload.bin', fileData: 'AQI=' }
      })
    ).resolves.toEqual({ requestId: 'upload-1', result: 'ok' });
    expect(nested.handle.getFileHandle).toHaveBeenCalledWith('upload.bin', { create: true });
    expect(file.write).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    expect(file.close).toHaveBeenCalledOnce();
  });

  it('streams upload chunks through one bounded content-side session', async () => {
    const file = createFile('upload.bin');
    const root = createDirectory({ 'upload.bin': file.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(
      handler({
        requestId: 'start',
        message: 'uploadStart',
        data: { uploadId: 'upload-1', path: '/', fileName: 'upload.bin', totalBytes: 3 }
      })
    ).resolves.toEqual({ requestId: 'start', result: 'ok' });
    await handler({ requestId: 'chunk-1', message: 'uploadChunk', data: { uploadId: 'upload-1', fileData: 'AQI=' } });
    await handler({ requestId: 'chunk-2', message: 'uploadChunk', data: { uploadId: 'upload-1', fileData: 'Aw==' } });
    await expect(
      handler({ requestId: 'complete', message: 'uploadComplete', data: { uploadId: 'upload-1' } })
    ).resolves.toEqual({ requestId: 'complete', result: 'ok' });

    expect(file.write.mock.calls.map(call => call[0])).toEqual([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(file.close).toHaveBeenCalledOnce();
    expect(file.abort).not.toHaveBeenCalled();
  });

  it('enforces the upload limit again in the content-script trust boundary', async () => {
    const root = createDirectory();
    const getRootDirectory = vi.fn(async () => root.handle);
    const handler = createOpfsMessageHandler({ getRootDirectory });

    await expect(
      handler({
        requestId: 'oversized',
        message: 'uploadStart',
        data: { uploadId: 'upload-1', path: '/', fileName: 'large.bin', totalBytes: MAX_OPFS_UPLOAD_BYTES + 1 }
      })
    ).resolves.toEqual({ requestId: 'oversized', error: '文件超过 50MB 上限: large.bin' });
    expect(getRootDirectory).not.toHaveBeenCalled();
  });

  it('aborts incomplete or oversized upload sessions', async () => {
    const file = createFile('upload.bin');
    const root = createDirectory({ 'upload.bin': file.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await handler({
      requestId: 'start',
      message: 'uploadStart',
      data: { uploadId: 'upload-1', path: '/', fileName: 'upload.bin', totalBytes: 1 }
    });
    await expect(
      handler({ requestId: 'chunk', message: 'uploadChunk', data: { uploadId: 'upload-1', fileData: 'AQI=' } })
    ).resolves.toEqual({ requestId: 'chunk', error: '上传数据超过声明大小' });

    expect(file.abort).toHaveBeenCalledOnce();
    expect(file.close).not.toHaveBeenCalled();
  });

  it('aborts a failed upload and preserves the write error', async () => {
    const file = createFile('upload.bin');
    file.write.mockRejectedValueOnce(new Error('write failed'));
    const root = createDirectory({ 'upload.bin': file.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(
      handler({ requestId: 'upload-failed', message: 'uploadFile', data: { fileName: 'upload.bin', fileData: 'AQI=' } })
    ).resolves.toEqual({ requestId: 'upload-failed', error: 'write failed' });
    expect(file.abort).toHaveBeenCalledOnce();
    expect(file.close).not.toHaveBeenCalled();
  });

  it('creates a validated directory in a freshly resolved parent', async () => {
    const nested = createDirectory();
    const root = createDirectory({ nested: nested.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(
      handler({ requestId: 'create-2', message: 'createDirectory', data: { path: '/nested', dirName: 'backup' } })
    ).resolves.toEqual({ requestId: 'create-2', result: 'ok' });
    expect(nested.handle.getDirectoryHandle).toHaveBeenCalledWith('backup', { create: true });
  });

  it('downloads through a fresh handle and revokes its object URL', async () => {
    const file = createFile('data.sqlite');
    const root = createDirectory({ 'data.sqlite': file.handle });
    const createObjectURL = vi.fn(() => 'blob:download');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const handler = createOpfsMessageHandler({
      getRootDirectory: async () => root.handle,
      document,
      url: { createObjectURL, revokeObjectURL }
    });

    await expect(
      handler({
        requestId: 'download-1',
        message: 'downloadFile',
        data: { relativePath: '/data.sqlite', fileName: 'copy.sqlite' }
      })
    ).resolves.toEqual({ requestId: 'download-1', result: 'ok' });
    expect(root.handle.getFileHandle).toHaveBeenCalledWith('data.sqlite', { create: false });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('deletes through a freshly resolved parent directory', async () => {
    const nestedFile = createFile('data.sqlite');
    const nested = createDirectory({ 'data.sqlite': nestedFile.handle });
    const root = createDirectory({ nested: nested.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });
    const request: OpfsRequest = {
      requestId: 'delete-1',
      message: 'deleteFile',
      data: { path: '/nested/data.sqlite' }
    };

    await expect(handler(request)).resolves.toEqual({ requestId: 'delete-1', result: 'ok' });
    expect(root.handle.getDirectoryHandle).toHaveBeenCalledWith('nested', { create: false });
    expect(nested.removeEntry).toHaveBeenCalledWith('data.sqlite', { recursive: false });
  });

  it('deletes directories recursively through their parent', async () => {
    const child = createDirectory();
    const root = createDirectory({ child: child.handle });
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await handler({ requestId: 'delete-dir-1', message: 'deleteDirectory', data: { path: '/child' } });

    expect(root.removeEntry).toHaveBeenCalledWith('child', { recursive: true });
  });

  it('returns a stable error when an entry is already stale', async () => {
    const root = createDirectory();
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(
      handler({ requestId: 'delete-2', message: 'deleteDirectory', data: { path: '/missing' } })
    ).resolves.toEqual({ requestId: 'delete-2', error: 'OPFS 条目不存在: /missing' });
  });

  it('rejects invalid create-directory names before touching OPFS', async () => {
    const root = createDirectory();
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(
      handler({ requestId: 'create-1', message: 'createDirectory', data: { path: '/', dirName: '..' } })
    ).resolves.toEqual({ requestId: 'create-1', error: 'OPFS 名称不能是 . 或 ..' });
    expect(root.handle.getDirectoryHandle).not.toHaveBeenCalled();
  });

  it('rejects unknown messages', async () => {
    const root = createDirectory();
    const handler = createOpfsMessageHandler({ getRootDirectory: async () => root.handle });

    await expect(handler({ requestId: 'unknown-1', message: 'destroyEverything' })).resolves.toEqual({
      requestId: 'unknown-1',
      error: '不支持的 OPFS 消息: destroyEverything'
    });
  });
});

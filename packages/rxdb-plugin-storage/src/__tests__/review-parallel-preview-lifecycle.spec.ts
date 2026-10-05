import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpfsStorageFilesystem } from '../filesystem/opfs-filesystem.js';
import type { StorageFilesystem } from '../filesystem/storage-filesystem.js';
import { ObjectUrlRegistry } from '../object-url.js';
import { createService, FakeStorageFileMeta, MemoryDirectoryHandle } from './fixtures/memory-storage.js';

beforeEach(() => {
  FakeStorageFileMeta.reset();
  const root = new MemoryDirectoryHandle();
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('并行评审：URL 生命周期跨异步读取', () => {
  it.each(['preview', 'createObjectUrl'] as const)('%s 的读取迟到不能在 destroy 后再留下 URL', async method => {
    let filesystem: StorageFilesystem | undefined;
    const createUrl = vi.fn(() => 'blob:review-late');
    const revokeUrl = vi.fn();
    const { service } = createService(
      {
        filesystem: (root, context) => {
          filesystem = createOpfsStorageFilesystem(root, context);
          return filesystem;
        }
      },
      new ObjectUrlRegistry(createUrl, revokeUrl)
    );
    try {
      const meta = await service.upload(new File(['read-late'], 'review.txt', { type: 'text/plain' }));
      if (!filesystem) throw new Error('复验夹具尚未创建文件系统');
      const readBlob = filesystem.readBlob.bind(filesystem);
      let release!: () => void;
      let markStarted!: () => void;
      const started = new Promise<void>(resolve => {
        markStarted = resolve;
      });
      const held = new Promise<void>(resolve => {
        release = resolve;
      });
      vi.spyOn(filesystem, 'readBlob').mockImplementation(async path => {
        const blob = await readBlob(path);
        markStarted();
        await held;
        return blob;
      });
      const pending = service[method](meta.id).then(
        () => undefined,
        () => undefined
      );
      await started;
      const destroyed = service.destroy();
      release();
      await Promise.all([pending, destroyed]);
      expect(service.activeObjectUrlCount).toBe(0);
      expect(createUrl.mock.calls.length).toBe(revokeUrl.mock.calls.length);
    } finally {
      await service.destroy();
    }
  });

  it('读取已完成的 URL 在 destroy 时正常回收', async () => {
    const createUrl = vi.fn(() => 'blob:review-before');
    const revokeUrl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(createUrl, revokeUrl));
    try {
      const meta = await service.upload(new File(['done'], 'review.txt'));
      await service.preview(meta.id);
      await service.destroy();
      expect(service.activeObjectUrlCount).toBe(0);
      expect(createUrl).toHaveBeenCalledOnce();
      expect(revokeUrl).toHaveBeenCalledOnce();
    } finally {
      await service.destroy();
    }
  });
});

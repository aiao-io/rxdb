import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageDestroyedError } from '../errors.js';
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

describe('URL 生命周期跨异步读取（RV-075）', () => {
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

  it.each(['preview', 'createObjectUrl'] as const)(
    '回归：%s 在读取迟到期间重复调用 destroy() 不会重复登记/回收',
    async method => {
      let filesystem: StorageFilesystem | undefined;
      const createUrl = vi.fn(() => 'blob:review-double-destroy');
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
        const meta = await service.upload(new File(['double-destroy'], 'review.txt', { type: 'text/plain' }));
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
        // destroy() 重复调用必须返回同一 Promise，不产生第二轮 waitForWrites/清理。
        const firstDestroy = service.destroy();
        const secondDestroy = service.destroy();
        expect(secondDestroy).toBe(firstDestroy);
        release();
        await Promise.all([pending, firstDestroy, secondDestroy]);
        expect(service.activeObjectUrlCount).toBe(0);
        expect(createUrl.mock.calls.length).toBe(revokeUrl.mock.calls.length);
      } finally {
        await service.destroy();
      }
    }
  );

  it.each(['preview', 'createObjectUrl'] as const)('回归：%s 的读取本身失败不会登记 URL', async method => {
    let filesystem: StorageFilesystem | undefined;
    const createUrl = vi.fn(() => 'blob:review-read-failure');
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
      const meta = await service.upload(new File(['read-fails'], 'review.txt', { type: 'text/plain' }));
      if (!filesystem) throw new Error('复验夹具尚未创建文件系统');
      vi.spyOn(filesystem, 'readBlob').mockRejectedValue(new Error('simulated read failure'));

      await expect(service[method](meta.id)).rejects.toThrow('simulated read failure');
      expect(createUrl).not.toHaveBeenCalled();
      expect(service.activeObjectUrlCount).toBe(0);
    } finally {
      await service.destroy();
    }
  });

  it.each(['preview', 'createObjectUrl'] as const)(
    '回归：%s 读取迟到并命中 destroy 时抛出 StorageDestroyedError，消费方可识别',
    async method => {
      let filesystem: StorageFilesystem | undefined;
      const { service } = createService({
        filesystem: (root, context) => {
          filesystem = createOpfsStorageFilesystem(root, context);
          return filesystem;
        }
      });
      try {
        const meta = await service.upload(new File(['late'], 'review.txt', { type: 'text/plain' }));
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
        const pending = service[method](meta.id);
        await started;
        const destroyed = service.destroy();
        release();
        await expect(pending).rejects.toBeInstanceOf(StorageDestroyedError);
        await destroyed;
      } finally {
        await service.destroy();
      }
    }
  );

  it('回归：消费者在 destroy 前主动 revoke 预览 URL，destroy 不重复回收', async () => {
    const createUrl = vi.fn(() => 'blob:review-consumer-revoke');
    const revokeUrl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(createUrl, revokeUrl));
    try {
      const meta = await service.upload(new File(['consumer-revoke'], 'review.txt'));
      const preview = await service.preview(meta.id);
      preview.dispose();
      expect(service.activeObjectUrlCount).toBe(0);
      await service.destroy();
      expect(revokeUrl).toHaveBeenCalledOnce();
      expect(createUrl).toHaveBeenCalledOnce();
    } finally {
      await service.destroy();
    }
  });
});

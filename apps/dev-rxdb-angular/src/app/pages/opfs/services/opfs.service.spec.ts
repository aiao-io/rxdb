import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpfsService } from './opfs.service';

describe('OpfsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('目录句柄不存在时应该清空旧内容并明确失败', async () => {
    const service = new OpfsService();
    const root = {
      getDirectoryHandle: async () => {
        throw new DOMException('Not found', 'NotFoundError');
      }
    } as unknown as FileSystemDirectoryHandle;
    service.rootHandle.set(root);
    service.entries.set([{ name: 'old.txt', kind: 'file', handle: {} as FileSystemFileHandle, path: '/old.txt' }]);

    await expect(service.readDirectory('/missing/')).rejects.toThrow('目录不存在: /missing/');
    expect(service.entries()).toEqual([]);
    expect(service.error()).toBe('目录不存在: /missing/');
    expect(service.loading()).toBe(false);
  });
});

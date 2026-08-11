import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOpfsService } from './useOpfsService';

async function* iterate<T>(items: readonly T[]): AsyncGenerator<T, undefined, unknown> {
  for (const item of items) yield item;
  return undefined;
}

describe('useOpfsService', () => {
  afterEach(() => {
    useOpfsService().reset();
    vi.unstubAllGlobals();
  });

  it('clears module state and directory handles on reset', async () => {
    const getFileHandle = vi.fn(async (): Promise<FileSystemFileHandle> => {
      throw new Error('unexpected file access');
    });
    const root: FileSystemDirectoryHandle = {
      [Symbol.asyncIterator]: () => iterate([]),
      entries: () => iterate([]),
      getFileHandle,
      getDirectoryHandle: vi.fn(async () => {
        throw new Error('unexpected directory access');
      }),
      isSameEntry: vi.fn(async () => false),
      kind: 'directory',
      keys: () => iterate([]),
      name: '',
      removeEntry: vi.fn(async () => undefined),
      resolve: vi.fn(async () => null),
      values: () => iterate([])
    };
    vi.stubGlobal('navigator', {
      storage: { getDirectory: vi.fn().mockResolvedValue(root) }
    });
    const service = useOpfsService();

    await service.init('/');
    service.entries.value = [
      {
        name: 'stale.txt',
        kind: 'file',
        path: '/stale.txt',
        handle: { kind: 'file', name: 'stale.txt' } as FileSystemFileHandle
      }
    ];
    service.error.value = 'stale error';

    service.reset();

    expect(service.entries.value).toEqual([]);
    expect(service.currentPath.value).toBe('/');
    expect(service.loading.value).toBe(false);
    expect(service.error.value).toBeNull();
    await expect(service.uploadFile(new File(['test'], 'new.txt'), '/')).resolves.toBe(false);
    expect(getFileHandle).not.toHaveBeenCalled();
  });
});

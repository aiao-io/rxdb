import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useStorageBrowser, type StorageBrowserService } from './useStorageBrowser';

function createStorage(overrides: Partial<StorageBrowserService> = {}): StorageBrowserService {
  return {
    list: vi.fn().mockResolvedValue([]),
    listEntries: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    clear: vi.fn(),
    ...overrides
  };
}

describe('useStorageBrowser', () => {
  it('falls back to root when a deep path fails to load', async () => {
    const failure = new Error('permission denied');
    const storage = createStorage({
      listEntries: vi.fn().mockImplementation(async ({ path }: { path: string }) => {
        if (path === '/docs') throw failure;
        return [];
      })
    });
    const showToast = vi.fn();
    const { result } = renderHook(() => useStorageBrowser({ storage }, showToast));

    await act(async () => {
      await result.current.refresh('/docs');
    });

    expect(storage.listEntries).toHaveBeenCalledWith({ path: '/docs' });
    expect(storage.listEntries).toHaveBeenCalledWith({ path: '/' });
    expect(result.current.currentPath).toBe('/');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('toasts the original error when the root path fails', async () => {
    const failure = new Error('disk offline');
    const storage = createStorage({
      listEntries: vi.fn().mockRejectedValue(failure)
    });
    const showToast = vi.fn();
    const { result } = renderHook(() => useStorageBrowser({ storage }, showToast));

    await act(async () => {
      await result.current.refresh('/');
    });

    expect(result.current.currentPath).toBe('/');
    expect(result.current.entries).toEqual([]);
    expect(showToast).toHaveBeenCalledWith('disk offline', 'error');
  });

  it('sorts directories before files after a successful refresh', async () => {
    const storage = createStorage({
      listEntries: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          name: 'b.txt',
          path: '/b.txt',
          meta: { id: '1', name: 'b.txt', size: 2, mimeType: 'text/plain', opfsPath: 'b.txt' }
        },
        { kind: 'directory', name: 'a', path: '/a' }
      ])
    });
    const { result } = renderHook(() => useStorageBrowser({ storage }, vi.fn()));

    await act(async () => {
      await result.current.refresh('/');
    });

    expect(result.current.entries.map(entry => entry.name)).toEqual(['a', 'b.txt']);
  });
});

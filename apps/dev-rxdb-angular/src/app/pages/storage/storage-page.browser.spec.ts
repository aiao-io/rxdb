import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { StoragePageBrowser } from './storage-page.browser';
import type { StorageBrowserItem } from './utils/storage-utils';

function createStorage(overrides: Partial<StoragePageBrowser['storage']> = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    listEntries: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    clear: vi.fn(),
    ...overrides
  };
}

describe('StoragePageBrowser', () => {
  it('keeps the current path and toasts when a deep directory fails', async () => {
    const failure = new Error('permission denied');
    const storage = createStorage({
      listEntries: vi.fn().mockRejectedValue(failure)
    });
    const showToast = vi.fn();
    const currentPath = signal('/docs');
    const browser = new StoragePageBrowser(storage, {
      currentPath,
      showToast
    });

    await browser.refreshCurrentDirectory();

    expect(currentPath()).toBe('/docs');
    expect(browser.entries()).toEqual([]);
    expect(browser.error()).toBe('permission denied');
    expect(showToast).toHaveBeenCalledWith('permission denied', 'error');
    expect(browser.loading()).toBe(false);
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
    const browser = new StoragePageBrowser(storage, {
      currentPath: signal('/'),
      showToast: vi.fn()
    });

    await browser.refreshCurrentDirectory();

    expect(browser.entries().map(entry => entry.name)).toEqual(['a', 'b.txt']);
  });

  it('always refreshes after a successful delete', async () => {
    const storage = createStorage({
      delete: vi.fn().mockResolvedValue(undefined)
    });
    const browser = new StoragePageBrowser(storage, {
      currentPath: signal('/'),
      showToast: vi.fn()
    });
    const refreshSpy = vi.spyOn(browser, 'refreshCurrentDirectory').mockResolvedValue(undefined);
    const entry: StorageBrowserItem = {
      kind: 'file',
      name: 'a.txt',
      path: '/a.txt',
      meta: { id: 'file-1', name: 'a.txt', size: 1, mimeType: 'text/plain', opfsPath: 'a.txt' } as never
    };

    await expect(browser.deleteEntry(entry)).resolves.toBe(true);
    expect(storage.delete).toHaveBeenCalledWith('file-1');
    expect(refreshSpy).toHaveBeenCalledOnce();
  });

  it('sets error and skips refresh when delete fails', async () => {
    const storage = createStorage({
      delete: vi.fn().mockRejectedValue(new Error('locked'))
    });
    const browser = new StoragePageBrowser(storage, {
      currentPath: signal('/'),
      showToast: vi.fn()
    });
    const refreshSpy = vi.spyOn(browser, 'refreshCurrentDirectory');
    const entry: StorageBrowserItem = {
      kind: 'file',
      name: 'a.txt',
      path: '/a.txt',
      meta: { id: 'file-1', name: 'a.txt', size: 1, mimeType: 'text/plain', opfsPath: 'a.txt' } as never
    };

    await expect(browser.deleteEntry(entry)).resolves.toBe(false);
    expect(browser.error()).toBe('locked');
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

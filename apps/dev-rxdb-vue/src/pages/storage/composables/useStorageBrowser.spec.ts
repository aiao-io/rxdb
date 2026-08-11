import { describe, expect, it, vi } from 'vitest';
import { useStorageBrowser, type StorageBrowserService } from './useStorageBrowser';

describe('useStorageBrowser', () => {
  it('keeps the failed deep path and exposes its original error', async () => {
    const failure = new Error('permission denied');
    const storage: StorageBrowserService = {
      list: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockRejectedValue(failure),
      delete: vi.fn(),
      clear: vi.fn()
    };
    const browser = useStorageBrowser({ storage });

    await browser.navigateTo('/private/');

    expect(storage.listEntries).toHaveBeenCalledTimes(1);
    expect(storage.listEntries).toHaveBeenCalledWith({ path: '/private' });
    expect(browser.currentPath.value).toBe('/private');
    expect(browser.error.value).toBe('加载目录失败: permission denied');
  });
});

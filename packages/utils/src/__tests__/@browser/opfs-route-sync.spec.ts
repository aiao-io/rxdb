import { describe, expect, it, vi } from 'vitest';
import { OpfsRouteSync } from '../../@browser/opfs-route-sync.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('OpfsRouteSync', () => {
  it('waits for availability and initializes from the deep link', async () => {
    const sync = new OpfsRouteSync();
    const init = vi.fn(() => Promise.resolve());
    const navigateTo = vi.fn(() => Promise.resolve());

    await sync.sync(false, '/docs/', () => '/', { init, navigateTo });
    expect(init).not.toHaveBeenCalled();

    await sync.sync(true, '/docs/', () => '/', { init, navigateTo });
    expect(init).toHaveBeenCalledWith('/docs/');
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('follows the latest route after rapid browser navigation', async () => {
    const sync = new OpfsRouteSync();
    const initialization = deferred();
    let currentPath = '/';
    const init = vi.fn(async (path: string) => {
      await initialization.promise;
      currentPath = path;
    });
    const navigateTo = vi.fn(async (path: string) => {
      currentPath = path;
    });

    const first = sync.sync(true, '/docs/', () => currentPath, { init, navigateTo });
    void sync.sync(true, '/photos/', () => currentPath, { init, navigateTo });
    initialization.resolve();
    await first;

    expect(init).toHaveBeenCalledWith('/docs/');
    expect(navigateTo).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith('/photos/');
  });

  // UTL-008：`#initialized = true` 原本在 `await actions.init(path)` **之前**。
  // init 抛错时标记已经留在 true 上 —— 之后所有请求都走 navigateTo 分支，
  // 这个从未初始化成功的实例再也无法重试初始化。
  it('init 失败后必须可以重试初始化', async () => {
    const sync = new OpfsRouteSync();
    const navigateTo = vi.fn(() => Promise.resolve());
    const init = vi
      .fn<(path: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('opfs unavailable'))
      .mockResolvedValue(undefined);

    await expect(sync.sync(true, '/docs/', () => '/', { init, navigateTo })).rejects.toThrow('opfs unavailable');
    expect(init).toHaveBeenCalledTimes(1);

    // 第二次必须重新走 init，而不是被当成「已初始化」转去 navigateTo
    await sync.sync(true, '/docs/', () => '/', { init, navigateTo });
    expect(init).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenLastCalledWith('/docs/');
    expect(navigateTo).not.toHaveBeenCalled();
  });
});

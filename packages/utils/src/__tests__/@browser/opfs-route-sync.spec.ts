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

  // RV-037（Vue）：目标路径与当前路径相同时，drain 循环一次 await 都不会碰到，
  // `#drain()` 同步跑完并在返回前就把 `#running` 清回 undefined——但
  // `this.#running ??= this.#drain(...)` 先求值右边（这一步已经把 #running 清空），
  // 再把结果写回 #running，相当于把一个「已经 resolve」的 Promise 重新钉死在
  // #running 上。此后任何新的 sync() 调用都会被 `??=` 当成「正在跑」而直接复用这个
  // 死 Promise，只改 #requestedPath 却再也没有循环去读它——后续所有导航请求静默丢失，
  // 直到页面重新加载。点目录行（内容先于 URL）之后浏览器“后退”到同一目录正好触发这条路径。
  it('命中一次无需等待的同路径同步后，后续真实导航请求不能被静默吞掉', async () => {
    const sync = new OpfsRouteSync();
    const init = vi.fn(() => Promise.resolve());
    const navigateTo = vi.fn(() => Promise.resolve());

    await sync.sync(true, '/a/', () => '/a/', { init, navigateTo });
    expect(init).toHaveBeenCalledWith('/a/');

    // 无需等待的同路径同步：#initialized 已为 true，且 path === getCurrentPath()，
    // 循环体一次 await 都不会执行。
    await sync.sync(true, '/a/', () => '/a/', { init, navigateTo });

    // 真实导航请求：目标路径与当前路径不同，理应触发 navigateTo。
    await sync.sync(true, '/b/', () => '/a/', { init, navigateTo });
    expect(navigateTo).toHaveBeenCalledWith('/b/');
  });
});

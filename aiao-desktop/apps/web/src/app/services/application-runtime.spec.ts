import { Type } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { StubApp, testWindow } from '../testing/desktop-apps';
import { ApplicationRuntime } from './application-runtime';
import { AppLoader, DesktopAppDefinition } from './desktop-apps';
import { DesktopWindow } from './desktop-window';

/** 手动放行的装载函数：控制「装载还在路上」的时机。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function windowWith(load: AppLoader | undefined): DesktopWindow {
  const base = testWindow('notes');
  const app: DesktopAppDefinition = { ...base.app, load };
  return new DesktopWindow(base.id, app, {}, base.initialBox);
}

const flush = () => new Promise<void>(done => setTimeout(done, 0));

describe('ApplicationRuntime：应用实例的生命周期', () => {
  it('新窗口是 registered；start 进入 loading，载荷到了变 ready 并带上组件', async () => {
    const runtime = new ApplicationRuntime();
    const win = windowWith(async () => StubApp);
    expect(win.state()).toBe('registered');
    runtime.start(win);
    expect(win.state()).toBe('loading');
    expect(win.content()).toBeNull();
    await flush();
    expect(win.state()).toBe('ready');
    expect(win.content()).toBe(StubApp);
    expect(win.failure()).toBeNull();
  });

  it('装载失败：failed，带原因，没有组件', async () => {
    const runtime = new ApplicationRuntime();
    const win = windowWith(() => Promise.reject(new Error('chunk 404')));
    runtime.start(win);
    await flush();
    expect(win.state()).toBe('failed');
    expect(win.failure()).toBe('chunk 404');
    expect(win.content()).toBeNull();
  });

  it('非 Error 的失败原因转成文字；没有登记载荷的应用直接失败并说明', async () => {
    const runtime = new ApplicationRuntime();
    const odd = windowWith(() => Promise.reject('boom'));
    runtime.start(odd);
    await flush();
    expect(odd.failure()).toBe('boom');
    const bare = windowWith(undefined);
    runtime.start(bare);
    expect(bare.state()).toBe('failed');
    expect(bare.failure()).toContain('没有登记应用载荷');
  });

  it('重试只对 failed 的窗口生效，创建新实例：实例序号加一，旧状态清掉', async () => {
    const runtime = new ApplicationRuntime();
    const load = vi.fn<AppLoader>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(StubApp);
    const win = windowWith(load);
    runtime.start(win);
    await flush();
    const firstInstance = win.instanceId;
    runtime.retry(win);
    expect(win.state()).toBe('loading');
    expect(win.failure()).toBeNull();
    expect(win.instanceId).not.toBe(firstInstance);
    await flush();
    expect(win.state()).toBe('ready');
    runtime.retry(win);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('装载中关闭窗口：迟到的结果被丢弃，已关闭的窗口不会重新出现', async () => {
    const runtime = new ApplicationRuntime();
    const pending = deferred<Type<unknown>>();
    const win = windowWith(() => pending.promise);
    runtime.start(win);
    runtime.closing(win);
    expect(win.state()).toBe('closing');
    runtime.closed(win);
    pending.resolve(StubApp);
    await flush();
    expect(win.state()).toBe('closed');
    expect(win.content()).toBeNull();
  });

  it('重试之后，旧实例迟到的成功或失败都不影响新实例', async () => {
    const runtime = new ApplicationRuntime();
    const first = deferred<Type<unknown>>();
    const second = deferred<Type<unknown>>();
    const loads = [first, second];
    const win = windowWith(() => loads.shift()!.promise);
    runtime.start(win);
    win.state.set('failed');
    runtime.retry(win);
    expect(win.state()).toBe('loading');
    first.resolve(StubApp);
    await flush();
    expect(win.state()).toBe('loading');
    expect(win.content()).toBeNull();
    second.reject(new Error('second failed'));
    await flush();
    expect(win.state()).toBe('failed');
    expect(win.failure()).toBe('second failed');
  });

  it('旧实例迟到的失败不会把已就绪的新实例弄坏', async () => {
    const runtime = new ApplicationRuntime();
    const first = deferred<Type<unknown>>();
    const loads: (() => Promise<Type<unknown>>)[] = [() => first.promise, async () => StubApp];
    const win = windowWith(() => loads.shift()!());
    runtime.start(win);
    win.state.set('failed');
    runtime.retry(win);
    await flush();
    expect(win.state()).toBe('ready');
    first.reject(new Error('late'));
    await flush();
    expect(win.state()).toBe('ready');
    expect(win.failure()).toBeNull();
  });

  it('closing 对已关闭的窗口不改状态', () => {
    const runtime = new ApplicationRuntime();
    const win = windowWith(async () => StubApp);
    runtime.closed(win);
    runtime.closing(win);
    expect(win.state()).toBe('closed');
  });

  it('实例标识是窗口 id 加实例序号', () => {
    const runtime = new ApplicationRuntime();
    const win = windowWith(async () => StubApp);
    runtime.start(win);
    expect(win.instanceId).toBe(`${win.id}#1`);
  });
});

describe('ApplicationRuntime：已登记但先不装载（ADESK-US-104）', () => {
  it('defer 让窗口停在 registered：不请求应用载荷，没有组件，也没有实例序号', async () => {
    const runtime = new ApplicationRuntime();
    const load = vi.fn<AppLoader>(async () => StubApp);
    const win = windowWith(load);
    runtime.defer(win);
    await flush();
    expect(win.state()).toBe('registered');
    expect(win.content()).toBeNull();
    expect(win.attempt).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('activate 把延后的窗口装载起来：registered → loading → ready，只装载一次', async () => {
    const runtime = new ApplicationRuntime();
    const load = vi.fn<AppLoader>(async () => StubApp);
    const win = windowWith(load);
    runtime.defer(win);
    runtime.activate(win);
    expect(win.state()).toBe('loading');
    expect(win.instanceId).toBe(`${win.id}#1`);
    await flush();
    expect(win.state()).toBe('ready');
    expect(win.content()).toBe(StubApp);

    runtime.activate(win);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('activate 对已经在装载、已就绪、失败（要走 retry）、正在关闭的窗口什么也不做', async () => {
    const runtime = new ApplicationRuntime();
    const load = vi.fn<AppLoader>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(StubApp);
    const win = windowWith(load);
    runtime.start(win);
    runtime.activate(win);
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(win.state()).toBe('failed');

    runtime.activate(win);
    expect(win.state()).toBe('failed');
    expect(load).toHaveBeenCalledTimes(1);

    const closing = windowWith(load);
    runtime.defer(closing);
    runtime.closing(closing);
    runtime.activate(closing);
    expect(closing.state()).toBe('closing');
  });

  it('延后的窗口被关闭：直接走 closing → closed，没装载过的载荷不会再被请求', async () => {
    const runtime = new ApplicationRuntime();
    const load = vi.fn<AppLoader>(async () => StubApp);
    const win = windowWith(load);
    runtime.defer(win);
    runtime.closing(win);
    runtime.closed(win);
    runtime.activate(win);
    await flush();
    expect(win.state()).toBe('closed');
    expect(load).not.toHaveBeenCalled();
  });

  it('只有刚登记、还没装载过的窗口能延后；装载中或已就绪的再 defer 是用法错误，直接抛出', async () => {
    const runtime = new ApplicationRuntime();
    const win = windowWith(async () => StubApp);
    runtime.start(win);
    expect(() => runtime.defer(win)).toThrow(/只有刚登记/);
    await flush();
    expect(() => runtime.defer(win)).toThrow(/只有刚登记/);
    expect(win.state()).toBe('ready');
  });
});

describe('ApplicationRuntime：窗口里的应用实例（remote-web 的 Orbit 实例，ADESK-US-206 阶段 C）', () => {
  /** 载荷（窗口组件）已装载、窗口 ready 的窗口。 */
  async function loadedWindow() {
    const runtime = new ApplicationRuntime();
    const win = windowWith(async () => StubApp);
    runtime.start(win);
    await flush();
    return { runtime, win };
  }

  it('组件装好后应用实例开始启动：回到 loading，实例序号与组件都不变', async () => {
    const { runtime, win } = await loadedWindow();
    const instance = win.instanceId;
    expect(runtime.beginInstance(win)).toBe(true);
    expect(win.state()).toBe('loading');
    expect(win.failure()).toBeNull();
    expect(win.instanceId).toBe(instance);
    expect(win.content()).toBe(StubApp);
  });

  it('实例就绪：只认当前实例 ID，当前实例的 ready 才让窗口变 ready', async () => {
    const { runtime, win } = await loadedWindow();
    runtime.beginInstance(win);
    expect(runtime.instanceReady(win, win.instanceId)).toBe(true);
    expect(win.state()).toBe('ready');
    expect(runtime.instanceReady(win, win.instanceId)).toBe(false);
  });

  it('重试创建新实例：新的实例 ID、重新 loading，组件不重载，失败原因清掉', async () => {
    const { runtime, win } = await loadedWindow();
    runtime.beginInstance(win);
    const first = win.instanceId;
    expect(runtime.instanceFailed(win, first, 'Aiao Code didn’t finish starting within 60 seconds.')).toBe(true);
    expect(win.state()).toBe('failed');
    expect(win.failure()).toBe('Aiao Code didn’t finish starting within 60 seconds.');
    const second = runtime.renew(win);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(second).toBe(win.instanceId);
    expect(win.state()).toBe('loading');
    expect(win.failure()).toBeNull();
    expect(win.content()).toBe(StubApp);
    const third = runtime.renew(win);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('旧实例迟到的 ready 按实例 ID 丢弃：不会让重试出来的新实例误判就绪（AC#14）', async () => {
    const { runtime, win } = await loadedWindow();
    runtime.beginInstance(win);
    const old = win.instanceId;
    runtime.instanceFailed(win, old, 'timeout');
    runtime.renew(win);
    expect(runtime.instanceReady(win, old)).toBe(false);
    expect(win.state()).toBe('loading');
    expect(runtime.instanceReady(win, win.instanceId)).toBe(true);
    expect(win.state()).toBe('ready');
  });

  it('旧实例迟到的失败也丢弃：不会把重试出来的新实例弄坏', async () => {
    const { runtime, win } = await loadedWindow();
    runtime.beginInstance(win);
    const old = win.instanceId;
    runtime.instanceFailed(win, old, 'timeout');
    runtime.renew(win);
    runtime.instanceReady(win, win.instanceId);
    expect(runtime.instanceFailed(win, old, 'late failure')).toBe(false);
    expect(win.state()).toBe('ready');
    expect(win.failure()).toBeNull();
  });

  it('运行中的实例也可以失败（应用自己跳转、关闭连接）：ready → failed', async () => {
    const { runtime, win } = await loadedWindow();
    runtime.beginInstance(win);
    runtime.instanceReady(win, win.instanceId);
    expect(runtime.instanceFailed(win, win.instanceId, 'left its page')).toBe(true);
    expect(win.state()).toBe('failed');
    expect(runtime.instanceFailed(win, win.instanceId, 'again')).toBe(false);
    expect(win.failure()).toBe('left its page');
  });

  it('加载中关闭窗口：旧实例迟到的 ready 与失败都被丢弃，已关闭的窗口不会重新出现，也不能重试', async () => {
    const { runtime, win } = await loadedWindow();
    runtime.beginInstance(win);
    const instance = win.instanceId;
    runtime.closing(win);
    expect(runtime.instanceReady(win, instance)).toBe(false);
    expect(runtime.instanceFailed(win, instance, 'late')).toBe(false);
    expect(win.state()).toBe('closing');
    expect(runtime.renew(win)).toBeNull();
    expect(runtime.beginInstance(win)).toBe(false);
    expect(win.instanceId).toBe(instance);
    runtime.closed(win);
    expect(runtime.instanceReady(win, instance)).toBe(false);
    expect(runtime.renew(win)).toBeNull();
    expect(win.state()).toBe('closed');
    expect(win.content()).toBeNull();
  });
});

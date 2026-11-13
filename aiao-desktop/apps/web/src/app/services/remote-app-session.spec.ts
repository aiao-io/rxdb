import '@angular/compiler';

import { OrbitError, OrbitProtocolError } from '@aiao/orbit';
import type { DesktopCapability } from '@aiao/orbit/desktop';
import { WINDOW_PROP } from '@aiao/orbit/window';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StubApp, testApps } from '../testing/desktop-apps';
import { FakeOrbitRuntime } from '../testing/fake-orbit';
import { fakeWindows } from '../testing/fake-windows';
import { BindOptions, DesktopAppContext } from './app-context';
import { ApplicationRuntime } from './application-runtime';
import { WebAppManifest } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { RemoteAppSession } from './remote-app-session';
import { SystemState } from './system-state';

const abort = new AbortController().signal;

/** Aiao Code 的登记形态：透明窗口、只声明 window 与剪贴板读写（两层一致）。 */
const CODE = ['window', 'clipboard:read', 'clipboard:write'] as const;

interface Setup {
  readonly capabilities?: readonly DesktopCapability[];
  readonly frame?: 'standard' | 'transparent';
}

function setup({ capabilities = CODE, frame = 'transparent' }: Setup = {}) {
  const registry = testApps({
    notes: {
      kind: 'web',
      name: 'Aiao Code',
      capabilities,
      web: {
        url: 'https://code.example/app/',
        version: 'online',
        allow: ['cross-origin-isolated', 'clipboard-read', 'clipboard-write'],
        readyTimeout: 60_000,
        frame
      }
    } as never
  });
  const win = new DesktopWindow('w1', registry.notes, {}, { left: 0, top: 0, width: 800, height: 600 });
  win.attempt = 1;
  win.state.set('ready');
  win.content.set(StubApp);
  const orbit = new FakeOrbitRuntime();
  const runtime = new ApplicationRuntime();
  const { windows, focused } = fakeWindows();
  const system = new SystemState();
  const theme = { setAppearance: vi.fn(), setAccent: vi.fn() };
  const contexts: { bind: (win: DesktopWindow, options?: BindOptions) => DesktopAppContext } = {
    bind: (target, options) =>
      new DesktopAppContext({
        win: target,
        capabilities: (target.app as WebAppManifest).capabilities ?? [],
        apps: registry,
        windows,
        system,
        theme,
        chrome: options?.chrome,
        notify: options?.notify ?? vi.fn()
      })
  };
  const session = new RemoteAppSession({ win, app: win.app as WebAppManifest, orbit, runtime, contexts });
  const container = {} as HTMLElement;
  return { session, win, orbit, runtime, windows, focused, system, container };
}

/** 模拟线上请求：调用实例上登记的处理函数。 */
const call = (handlers: ReadonlyMap<string, (...args: never[]) => unknown>, method: string, payload: unknown) =>
  (handlers.get(method) as unknown as (payload: unknown, signal: AbortSignal) => Promise<unknown>)(payload, abort);

/** 让已排队的微任务与零延时定时器跑完（测试用的是假定时器）。 */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RemoteAppSession：一次启动', () => {
  it('创建会话就进入 loading（窗口组件已装载、应用实例还没就绪）：第一屏就是加载状态，不闪空白', () => {
    const { win } = setup();
    expect(win.state()).toBe('loading');
  });

  it('实例 ID 取窗口当前的实例 ID，入口、版本、浏览器权限与就绪时限来自清单，启动属性带窗口与能力信息', () => {
    const { session, win, orbit, container } = setup();
    void session.start(container);
    const { options } = orbit.last;
    expect(options).toMatchObject({
      appId: 'notes',
      instanceId: win.instanceId,
      version: 'online',
      url: 'https://code.example/app/',
      title: 'Aiao Code',
      allow: 'cross-origin-isolated; clipboard-read; clipboard-write',
      timeout: 60_000
    });
    expect(options.props?.['orbit.desktop']).toEqual({ capabilities: ['window', 'clipboard:read', 'clipboard:write'] });
    expect(options.props?.[WINDOW_PROP]).toMatchObject({ platform: 'macos', frame: 'transparent', decorations: true });
    expect(orbit.last.container).toBe(container);
    expect(session.instance).toBe(orbit.last);
  });

  it('应用报告就绪：窗口 ready；握手前就已经登记好桌面能力与窗口请求，应用的第一个请求就能被处理', async () => {
    const { session, win, orbit, container } = setup();
    const started = session.start(container);
    expect([...orbit.last.handlers.keys()]).toEqual(
      expect.arrayContaining(['desktop.window.setTitle', 'window.setTitle'])
    );
    orbit.last.becomeReady();
    await started;
    expect(win.state()).toBe('ready');
    expect(win.failure()).toBeNull();
  });

  it('桌面能力与旧版窗口请求落在同一个窗口上：新信封改标题、旧版逐方法协议也改标题', async () => {
    const { session, win, orbit, container } = setup();
    void session.start(container);
    const { handlers } = orbit.last;
    expect(
      await call(handlers, 'desktop.window.setTitle', { instanceId: win.instanceId, args: 'from envelope' })
    ).toEqual({
      ok: true,
      value: null
    });
    expect(win.title()).toBe('from envelope');
    expect(await call(handlers, 'window.setTitle', 'from legacy')).toBeNull();
    expect(win.title()).toBe('from legacy');
  });

  it('没声明 window 能力的应用：启动属性里没有窗口信息，旧版窗口请求根本没登记；新信封的窗口请求被拒绝并给出可见原因', async () => {
    const { session, win, orbit, container } = setup({ capabilities: [] });
    void session.start(container);
    expect(orbit.last.options.props?.[WINDOW_PROP]).toBeUndefined();
    expect(orbit.last.handlers.has('window.setTitle')).toBe(false);
    const reply = await call(orbit.last.handlers, 'desktop.window.setTitle', { instanceId: win.instanceId, args: 'x' });
    expect(reply).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(win.title()).toBe('Aiao Code');
    expect(session.notice()).toMatchObject({ code: 'CAPABILITY_DENIED', method: 'window.setTitle' });
    expect(session.notice()?.text).toBe('“Aiao Code” isn’t allowed to use window (window.setTitle).');
  });

  it('提示条几秒后自己消失；新的提示替换旧的', async () => {
    const { session, win, orbit, container } = setup({ capabilities: [] });
    void session.start(container);
    const deny = (method: string) => call(orbit.last.handlers, method, { instanceId: win.instanceId, args: null });
    await deny('desktop.app.focus');
    expect(session.notice()?.method).toBe('app.focus');
    await vi.advanceTimersByTimeAsync(3_000);
    await deny('desktop.app.quit');
    expect(session.notice()?.method).toBe('app.quit');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(session.notice()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(session.notice()).toBeNull();
  });

  it('透明窗口：应用隐藏桌面标题栏后，就绪时桌面不再画标题栏；加载中与失败时始终画', async () => {
    const { session, orbit, container, win, runtime } = setup();
    const started = session.start(container);
    expect(session.chrome()).toBe(true);
    await call(orbit.last.handlers, 'window.setDecorations', false);
    expect(session.decorations()).toBe(false);
    expect(session.chrome()).toBe(true);
    orbit.last.becomeReady();
    await started;
    expect(session.chrome()).toBe(false);
    runtime.instanceFailed(win, win.instanceId, 'x');
    expect(session.chrome()).toBe(true);
  });

  it('应用上报的拖动区交给窗口去画；应用实例失败后清空', async () => {
    const { session, orbit, container } = setup();
    const started = session.start(container);
    const region = { x: 0, y: 0, width: 800, height: 36, holes: [] };
    await call(orbit.last.handlers, 'window.setDragRegions', [region]);
    expect(session.dragRegions()).toEqual([region]);
    orbit.last.failWith(new OrbitError('APP_ERROR', 'boom'));
    await started;
    expect(session.dragRegions()).toEqual([]);
  });

  it('窗口状态变化经旧版事件推给应用（前台变化、缩放…）', async () => {
    const { session, orbit, container, win, focused } = setup();
    const started = session.start(container);
    orbit.last.becomeReady();
    await started;
    focused.set(win);
    session.context?.publishWindow();
    expect(orbit.last.emitted.map(([event]) => event).sort()).toEqual(['desktop.window.state', 'window.state']);
  });
});

describe('RemoteAppSession：失败与重试（AC#3）', () => {
  it('就绪超时：窗口 failed，带上原因；别的窗口不受影响；实例的能力上下文随之解绑，迟到的请求 WINDOW_CLOSED', async () => {
    const { session, win, orbit, container } = setup();
    const started = session.start(container);
    const first = orbit.last;
    const other = new DesktopWindow('w2', win.app, {}, { left: 0, top: 0, width: 1, height: 1 });
    other.state.set('ready');
    first.failWith(new OrbitError('TIMEOUT', '应用未在期限内就绪'));
    await started;
    expect(win.state()).toBe('failed');
    expect(win.failure()).toBe('Aiao Code didn’t finish starting within 60 seconds.');
    expect(other.state()).toBe('ready');
    const late = await call(first.registered, 'desktop.window.setTitle', { instanceId: 'w1#1', args: 'late' });
    expect(late).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
    expect(win.title()).toBe('Aiao Code');
  });

  it('重试创建新实例：新的实例 ID、新的 Orbit 实例、新的能力上下文；旧实例已销毁，不复用旧 iframe', async () => {
    const { session, win, orbit, container } = setup();
    const started = session.start(container);
    const first = orbit.last;
    first.failWith(new OrbitError('TIMEOUT', 'x'));
    await started;
    const firstId = win.instanceId;
    const retried = session.retry();
    expect(win.state()).toBe('loading');
    expect(win.failure()).toBeNull();
    expect(win.instanceId).not.toBe(firstId);
    expect(orbit.created).toHaveLength(2);
    const second = orbit.last;
    expect(second).not.toBe(first);
    expect(second.options.instanceId).toBe(win.instanceId);
    expect(second.container).toBe(container);
    expect(first.calls).toContain('destroy');
    second.becomeReady();
    await retried;
    expect(win.state()).toBe('ready');
    expect(session.instance).toBe(second);
  });

  it('每次重试的实例 ID 都不同', async () => {
    const { session, win, orbit, container } = setup();
    void session.start(container);
    const ids = [win.instanceId];
    for (let index = 0; index < 3; index++) {
      orbit.last.failWith(new OrbitError('LOAD_ERROR', 'x'));
      await flush();
      void session.retry();
      ids.push(win.instanceId);
    }
    expect(new Set(ids).size).toBe(4);
    expect(orbit.created.map(item => item.options.instanceId)).toEqual(ids);
  });

  it('旧实例迟到的 ready 按实例 ID 丢弃：不会让重试出来的新实例误判就绪（AC#14）', async () => {
    const { session, win, orbit, container } = setup();
    const started = session.start(container);
    const first = orbit.last;
    first.failWith(new OrbitError('TIMEOUT', 'x'));
    await started;
    const retried = session.retry();
    const second = orbit.last;
    first.resolveLate();
    await flush();
    expect(win.state()).toBe('loading');
    second.becomeReady();
    await retried;
    expect(win.state()).toBe('ready');
  });

  it('重试时旧实例还没结束（卡在加载中）：旧实例被销毁，它迟到的结果不影响新实例', async () => {
    const { session, win, orbit, container, runtime } = setup();
    const first = (void session.start(container), orbit.last);
    win.state.set('failed');
    const retried = session.retry();
    expect(first.calls).toContain('destroy');
    first.resolveLate();
    await flush();
    expect(win.state()).toBe('loading');
    expect(runtime.instanceReady(win, 'w1#1')).toBe(false);
    orbit.last.becomeReady();
    await retried;
    expect(win.state()).toBe('ready');
  });

  it('旧实例迟到的 setTitle 按实例 ID 丢弃，新实例的窗口标题不变（AC#18）', async () => {
    const { session, win, orbit, container } = setup();
    const started = session.start(container);
    const first = orbit.last;
    await call(first.handlers, 'desktop.window.setTitle', { instanceId: 'w1#1', args: 'first title' });
    expect(win.title()).toBe('first title');
    first.failWith(new OrbitError('TIMEOUT', 'x'));
    await started;
    expect(win.title()).toBe('Aiao Code');
    const retried = session.retry();
    orbit.last.becomeReady();
    await retried;
    for (const method of ['desktop.window.setTitle']) {
      const late = await call(first.registered, method, { instanceId: 'w1#1', args: 'stale title' });
      expect(late).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
    }
    expect(() => call(first.registered, 'window.setTitle', 'stale legacy title')).toThrow(
      expect.objectContaining({ name: 'DesktopError', code: 'WINDOW_CLOSED' })
    );
    expect(win.title()).toBe('Aiao Code');
    await call(orbit.last.handlers, 'desktop.window.setTitle', { instanceId: win.instanceId, args: 'second title' });
    expect(win.title()).toBe('second title');
  });

  it('应用自报失败、协议不兼容各给出自己的原因', async () => {
    const reasons: string[] = [];
    for (const error of [
      new OrbitError('APP_ERROR', '工作台挂载失败'),
      new OrbitProtocolError(2, 1),
      new OrbitError('LOAD_ERROR', 'x')
    ]) {
      const { session, win, orbit, container } = setup();
      const started = session.start(container);
      orbit.last.failWith(error);
      await started;
      reasons.push(win.failure() ?? '');
    }
    expect(reasons).toEqual([
      'Aiao Code reported: 工作台挂载失败',
      'Aiao Code needs a newer Aiao Desktop: it uses app protocol v2, but this desktop supports up to v1.',
      'code.example didn’t connect. It may be offline, blocked by the browser, or not set up for Aiao Desktop.'
    ]);
  });

  it('运行中应用自己跳转或关闭连接：窗口 failed，原因是它离开了自己的页面', async () => {
    const { session, win, orbit, container } = setup();
    const started = session.start(container);
    orbit.last.becomeReady();
    await started;
    orbit.last.failWith(new OrbitError('NAVIGATION', 'x'));
    expect(win.state()).toBe('failed');
    expect(win.failure()).toBe('Aiao Code left its page or closed its connection.');
  });

  it('重试时窗口已在关闭：什么都不创建', async () => {
    const { session, win, orbit, container, runtime } = setup();
    const started = session.start(container);
    orbit.last.failWith(new OrbitError('TIMEOUT', 'x'));
    await started;
    runtime.closing(win);
    await session.retry();
    expect(orbit.created).toHaveLength(1);
    expect(win.state()).toBe('closing');
  });
});

describe('RemoteAppSession：关闭（AC#14）', () => {
  it('加载中关闭窗口：能力上下文立刻解绑；旧实例迟到的 ready 被丢弃，已关闭的窗口不会重新出现', async () => {
    const { session, win, orbit, container, runtime } = setup();
    const started = session.start(container);
    const first = orbit.last;
    runtime.closing(win);
    win.beforeClose.next();
    const late = await call(first.registered, 'desktop.window.setTitle', { instanceId: 'w1#1', args: 'x' });
    expect(late).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
    first.resolveLate();
    session.dispose();
    await started;
    expect(win.state()).toBe('closing');
    runtime.closed(win);
    first.resolveLate();
    await flush();
    expect(win.state()).toBe('closed');
    expect(win.content()).toBeNull();
    expect(first.calls).toContain('destroy');
  });

  it('销毁会话：Orbit 实例销毁、上下文解绑、定时器清掉；幂等；销毁后启动或重试什么都不做', async () => {
    const { session, win, orbit, container } = setup({ capabilities: [] });
    const started = session.start(container);
    await call(orbit.last.handlers, 'desktop.app.quit', { instanceId: win.instanceId, args: null });
    expect(session.notice()).not.toBeNull();
    session.dispose();
    session.dispose();
    await started;
    expect(orbit.last.calls).toContain('destroy');
    expect(session.instance).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    await session.start(container);
    await session.retry();
    expect(orbit.created).toHaveLength(1);
    expect(win.state()).toBe('loading');
  });

  it('销毁会话不会把加载中的窗口标成失败（销毁产生的 DESTROYED 属于关窗口）', async () => {
    const { session, win, container } = setup();
    const started = session.start(container);
    session.dispose();
    await started;
    expect(win.state()).toBe('loading');
    expect(win.failure()).toBeNull();
  });
});

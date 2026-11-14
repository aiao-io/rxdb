import '@angular/compiler';

import { OrbitError, OrbitProtocolError } from '@aiao/orbit';
import type { DesktopCapability } from '@aiao/orbit/desktop';
import { WINDOW_PROP } from '@aiao/orbit/window';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StubApp, testApps } from '../testing/desktop-apps';
import { fakeHostServices } from '../testing/fake-host-services';
import { FakeOrbitRuntime } from '../testing/fake-orbit';
import { fakeWindows } from '../testing/fake-windows';
import { BindOptions, DesktopAppContext } from './app-context';
import { ApplicationRuntime } from './application-runtime';
import type { AppCapabilityRestriction } from './browser-app-support';
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
  readonly effectiveCapabilities?: readonly DesktopCapability[];
  readonly restrictions?: readonly AppCapabilityRestriction[];
}

function setup({ capabilities = CODE, frame = 'transparent', effectiveCapabilities, restrictions }: Setup = {}) {
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
  const services = fakeHostServices();
  const bound: BindOptions[] = [];
  const contexts: { bind: (win: DesktopWindow, options?: BindOptions) => DesktopAppContext } = {
    bind: (target, options) => {
      bound.push(options ?? {});
      return new DesktopAppContext({
        win: target,
        capabilities: effectiveCapabilities ?? (target.app as WebAppManifest).capabilities ?? [],
        restrictions,
        apps: registry,
        windows,
        system,
        theme,
        chrome: options?.chrome,
        notify: options?.notify ?? vi.fn(),
        notifications: services.notifications,
        clipboard: services.clipboard,
        panels: services.panels,
        files: services.files,
        refocus: options?.refocus,
        newHandle: services.newHandle
      });
    }
  };
  const session = new RemoteAppSession({ win, app: win.app as WebAppManifest, orbit, runtime, contexts });
  const container = {} as HTMLElement;
  return { session, win, orbit, runtime, windows, focused, system, container, services, bound };
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

  it('浏览器禁用的能力不在握手公告与实际授权里，加载前就提供持续显示的原因', async () => {
    const restrictions = [
      { capability: 'clipboard:read' as const, reason: 'Clipboard reading is disabled in Safari.' }
    ];
    const { session, orbit, container, win, services } = setup({
      effectiveCapabilities: ['window', 'clipboard:write'],
      restrictions
    });
    const started = session.start(container);
    expect(session.restrictions()).toEqual(restrictions);
    expect(orbit.last.options.props?.['orbit.desktop']).toEqual({ capabilities: ['window', 'clipboard:write'] });
    expect(
      await call(orbit.last.handlers, 'desktop.clipboard.readText', { instanceId: win.instanceId, args: null })
    ).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(services.clipboard.readText).not.toHaveBeenCalled();
    orbit.last.becomeReady();
    await started;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(session.restrictions()).toEqual(restrictions);
    session.dispose();
    expect(session.restrictions()).toEqual([]);
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

describe('RemoteAppSession：文件与剪贴板能力经 Orbit（AC#11、#12、#16、#17）', () => {
  const FILES = ['window', 'filesystem:read', 'filesystem:write', 'clipboard:read', 'clipboard:write'] as const;
  const DOC = ['Users', 'prasenjit', 'Documents', 'note.md'];
  /** 线上请求：带请求 ID 的需要用户操作的请求，应答「已受理」，最终结果经完成事件送达。 */
  const settled = (orbit: FakeOrbitRuntime) =>
    orbit.last.emitted.filter(([event]) => event === 'desktop.request.settled').map(([, payload]) => payload);
  const idle = () => vi.advanceTimersByTimeAsync(0);

  async function ready(capabilities: readonly DesktopCapability[] = FILES) {
    const context = setup({ capabilities });
    const started = context.session.start(context.container);
    context.orbit.last.becomeReady();
    await started;
    return context;
  }

  it('打开：应答「已受理」，用户在桌面面板里选定之后，内容与凭证经完成事件到达应用（字节是 base64）', async () => {
    const { win, orbit, services } = await ready();
    const reply = await call(orbit.last.handlers, 'desktop.filesystem.open', {
      instanceId: win.instanceId,
      args: { accept: ['.md'] },
      requestId: 'r1'
    });
    expect(reply).toEqual({ ok: true, value: null });
    await idle();
    expect(services.panels.top?.request).toMatchObject({ mode: 'open', accept: ['.md'], app: { name: 'Aiao Code' } });
    expect(settled(orbit)).toEqual([]);
    services.panels.top!.submit({ kind: 'open', path: DOC });
    await idle();
    expect(settled(orbit)).toEqual([
      {
        requestId: 'r1',
        envelope: {
          ok: true,
          value: { name: 'note.md', mime: 'text/markdown', size: 5, bytes: 'aGVsbG8=', handle: 'h1', version: '1000:5' }
        }
      }
    ]);
  });

  it('用户在面板里停留很久也不超时：面板开着时过了宿主的处理时限（5 秒）与应用的兜底时限（7 秒），选定后仍然成功', async () => {
    const { win, orbit, services } = await ready();
    await call(orbit.last.handlers, 'desktop.filesystem.open', {
      instanceId: win.instanceId,
      args: {},
      requestId: 'r1'
    });
    await idle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(settled(orbit)).toEqual([]);
    services.panels.top!.submit({ kind: 'open', path: DOC });
    await idle();
    expect(settled(orbit)).toMatchObject([{ requestId: 'r1', envelope: { ok: true } }]);
  });

  it('用户取消：完成事件里是 USER_CANCELLED，窗口里没有错误提示，磁盘没碰', async () => {
    const { win, orbit, services, session } = await ready();
    await call(orbit.last.handlers, 'desktop.filesystem.open', {
      instanceId: win.instanceId,
      args: {},
      requestId: 'r1'
    });
    await idle();
    services.panels.top!.cancel();
    await idle();
    expect(settled(orbit)).toMatchObject([{ envelope: { ok: false, code: 'USER_CANCELLED' } }]);
    expect(session.notice()).toBeNull();
    expect(services.files.snapshot).not.toHaveBeenCalled();
  });

  it('面板还开着时关闭窗口（AC#17）：面板随窗口关闭，请求以 WINDOW_CLOSED 结束（关闭动画里实例还活着，应用收得到），磁盘不变', async () => {
    const { win, orbit, services, runtime } = await ready();
    await call(orbit.last.handlers, 'desktop.filesystem.save', {
      instanceId: win.instanceId,
      args: { suggestedName: 'a.txt', bytes: 'aGk=' },
      requestId: 'r1'
    });
    await idle();
    const panel = services.panels.top!;
    runtime.closing(win);
    win.beforeClose.next();
    await idle();
    expect(panel.closed).toBe(true);
    expect(settled(orbit)).toMatchObject([{ requestId: 'r1', envelope: { ok: false, code: 'WINDOW_CLOSED' } }]);
    /* 面板已经收回：用户在关闭的同一刻再选也不会提交任何写入。 */
    panel.submit({ kind: 'save', dir: ['Users'], name: 'a.txt', replace: true });
    await idle();
    expect(services.files.create).not.toHaveBeenCalled();
    expect(services.files.replace).not.toHaveBeenCalled();
  });

  it('旧实例迟到的 filesystem.save 被丢弃（AC#17）：窗口关闭、实例销毁之后，带凭证与不带凭证的迟到保存都是 WINDOW_CLOSED，没有写盘', async () => {
    const { win, orbit, services, session, runtime } = await ready();
    const first = orbit.last;
    await call(first.handlers, 'desktop.filesystem.open', { instanceId: win.instanceId, args: {}, requestId: 'r1' });
    await idle();
    services.panels.top!.submit({ kind: 'open', path: DOC });
    await idle();
    const instanceId = win.instanceId;
    runtime.closing(win);
    win.beforeClose.next();
    session.dispose();
    runtime.closed(win);
    const late = (args: unknown, requestId?: string) =>
      call(first.registered, 'desktop.filesystem.save', { instanceId, args, ...(requestId ? { requestId } : {}) });
    expect(
      await late({ handle: 'h1', suggestedName: 'late', bytes: 'bGF0ZQ==', expectedVersion: '1000:5' })
    ).toMatchObject({
      ok: false,
      code: 'WINDOW_CLOSED'
    });
    expect(await late({ suggestedName: 'late.txt', bytes: 'bGF0ZQ==' }, 'late-1')).toMatchObject({
      ok: false,
      code: 'WINDOW_CLOSED'
    });
    expect(services.files.replace).not.toHaveBeenCalled();
    expect(services.files.create).not.toHaveBeenCalled();
    expect(services.panels.shown).toHaveLength(1);
  });

  it('重试出了新实例（AC#16④）：旧实例迟到的保存按实例 ID 丢弃；新实例用旧凭证是 HANDLE_INVALID，磁盘不变', async () => {
    const { win, orbit, services, session } = await ready();
    const first = orbit.last;
    await call(first.handlers, 'desktop.filesystem.open', { instanceId: win.instanceId, args: {}, requestId: 'r1' });
    await idle();
    services.panels.top!.submit({ kind: 'open', path: DOC });
    await idle();
    const oldInstance = win.instanceId;
    first.failWith(new OrbitError('APP_ERROR', 'boom'));
    await idle();
    const retrying = session.retry();
    await idle();
    const second = orbit.last;
    second.becomeReady();
    await retrying;
    expect(win.instanceId).not.toBe(oldInstance);
    const save = { handle: 'h1', suggestedName: 'x', bytes: 'eA==', expectedVersion: '1000:5' };
    expect(
      await call(first.registered, 'desktop.filesystem.save', { instanceId: oldInstance, args: save })
    ).toMatchObject({
      ok: false,
      code: 'WINDOW_CLOSED'
    });
    expect(
      await call(second.handlers, 'desktop.filesystem.save', { instanceId: oldInstance, args: save })
    ).toMatchObject({
      ok: false,
      code: 'WINDOW_CLOSED'
    });
    expect(
      await call(second.handlers, 'desktop.filesystem.save', { instanceId: win.instanceId, args: save })
    ).toMatchObject({
      ok: false,
      code: 'HANDLE_INVALID'
    });
    expect(services.files.replace).not.toHaveBeenCalled();
    expect(win.state()).toBe('ready');
  });

  it('文件面板关闭后把键盘焦点还给应用的文档：实例就绪才还，已失败或已销毁的不动', async () => {
    const { session, orbit, bound, container } = setup();
    const started = session.start(container);
    const refocus = bound[0]!.refocus!;
    refocus();
    expect(orbit.last.calls).not.toContain('focus');
    orbit.last.becomeReady();
    await started;
    refocus();
    expect(orbit.last.calls.filter(call => call === 'focus')).toHaveLength(1);
    session.dispose();
    refocus();
    expect(orbit.last.calls.filter(call => call === 'focus')).toHaveLength(1);
  });

  it('剪贴板：写入经应用的用户手势有效期；没有手势是 BROWSER_PERMISSION_DENIED，只回给应用，窗口里没有提示条', async () => {
    const { win, orbit, services, session } = await ready();
    const write = (text: string) =>
      call(orbit.last.handlers, 'desktop.clipboard.writeText', { instanceId: win.instanceId, args: text });
    expect(await write('with gesture')).toEqual({ ok: true, value: null });
    services.clipboard.userActive.mockReturnValue(false);
    expect(await write('without gesture')).toMatchObject({ ok: false, code: 'BROWSER_PERMISSION_DENIED' });
    expect(services.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('with gesture');
    expect(session.notice()).toBeNull();
    expect(
      await call(orbit.last.handlers, 'desktop.clipboard.readText', { instanceId: win.instanceId, args: null })
    ).toEqual({ ok: true, value: 'clipboard text' });
  });

  it('未声明的文件、通知能力（Aiao Code 的最小清单）：稳定的 CAPABILITY_DENIED 与窗口里的可见原因，宿主服务一个也没被碰', async () => {
    const { win, orbit, services, session } = await ready(['window', 'clipboard:read', 'clipboard:write']);
    const ask = (method: string, args: unknown) =>
      call(orbit.last.handlers, `desktop.${method}`, { instanceId: win.instanceId, args });
    expect(await ask('notification.post', { title: 'T', body: 'B' })).toMatchObject({
      ok: false,
      code: 'CAPABILITY_DENIED'
    });
    expect(await ask('appearance.set', { appearance: 'dark' })).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(
      await call(orbit.last.handlers, 'desktop.filesystem.open', {
        instanceId: win.instanceId,
        args: {},
        requestId: 'r1'
      })
    ).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(await ask('filesystem.save', { handle: 'h1', suggestedName: 'a', bytes: '' })).toMatchObject({
      ok: false,
      code: 'CAPABILITY_DENIED'
    });
    expect(session.notice()?.code).toBe('CAPABILITY_DENIED');
    expect(services.notifications.post).not.toHaveBeenCalled();
    expect(services.panels.show).not.toHaveBeenCalled();
    expect(services.files.replace).not.toHaveBeenCalled();
  });
});

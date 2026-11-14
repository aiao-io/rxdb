import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopAppearance,
  DesktopCapability,
  DesktopHost,
  DesktopInteraction,
  DesktopMenu,
  DesktopOpenedFile,
  DesktopWindowState
} from '../desktop.js';
import { DESKTOP_LIMITS, DesktopError, desktopProps, serveDesktop } from '../desktop.js';
import type { OrbitInstance, OrbitValue } from '../index.js';
import { createOrbit } from '../index.js';

const resources: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of resources.splice(0).reverse()) cleanup();
});

const state: DesktopWindowState = {
  platform: 'macos',
  frame: 'transparent',
  decorations: true,
  focused: true,
  maximized: false,
  minimized: false
};
const look: DesktopAppearance = { theme: 'light', appearance: 'auto', accent: 'blue' };

/** 记录调用的宿主；事件监听器留在集合里，测试从宿主一侧触发事件。 */
function recordingHost() {
  const calls: unknown[][] = [];
  const listeners = {
    state: new Set<(next: DesktopWindowState) => void>(),
    command: new Set<(commandId: string) => void>(),
    appearance: new Set<(next: DesktopAppearance) => void>()
  };
  const note =
    <T>(name: string, result?: T) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return result as T;
    };
  const subscribe = <T>(set: Set<(value: T) => void>) => {
    return (listener: (value: T) => void) => {
      set.add(listener);
      return () => set.delete(listener);
    };
  };
  const host: DesktopHost = {
    window: {
      getState: note('window.getState', state),
      setTitle: note('window.setTitle'),
      minimize: note('window.minimize'),
      restore: note('window.restore'),
      toggleMaximize: note('window.toggleMaximize'),
      close: note('window.close'),
      setDecorations: note('window.setDecorations'),
      setDragRegions: note('window.setDragRegions'),
      onStateChange: subscribe(listeners.state)
    },
    menu: { set: note('menu.set'), onCommand: subscribe(listeners.command) },
    app: { open: note('app.open'), focus: note('app.focus'), quit: note('app.quit') },
    appearance: {
      get: note('appearance.get', look),
      set: note('appearance.set'),
      onChange: subscribe(listeners.appearance)
    },
    notification: { post: note('notification.post', { id: 'n-1' }) },
    clipboard: { readText: note('clipboard.readText', 'pasted'), writeText: note('clipboard.writeText') },
    filesystem: {
      open: options => {
        calls.push(['filesystem.open', options]);
        return opened;
      },
      save: request => {
        calls.push(['filesystem.save', request]);
        return { name: 'notes.md', version: '1731000000500:5', handle: 'handle-1' };
      }
    }
  };
  return { host, calls, listeners };
}

const opened: DesktopOpenedFile = {
  name: 'notes.md',
  mime: 'text/markdown',
  size: 5,
  bytes: new Uint8Array([104, 101, 108, 108, 111]),
  handle: 'handle-1',
  version: '1731000000000:5'
};

async function mount(capabilities: readonly DesktopCapability[]) {
  const runtime = createOrbit({ onError: vi.fn() });
  const container = document.createElement('div');
  container.style.cssText = 'width:640px;height:360px';
  document.body.append(container);
  resources.push(() => {
    runtime.dispose();
    container.remove();
  });
  const instance: OrbitInstance = runtime.createApp({
    appId: 'desktop',
    instanceId: 'w1#1',
    version: '1',
    url: new URL('/test-app/app.html', location.href).href,
    timeout: 5000,
    props: desktopProps(capabilities)
  });
  const hosted = recordingHost();
  const onError = vi.fn();
  const server = serveDesktop(instance, hosted.host, { capabilities, onError });
  await instance.mount(container);
  const ask = (action: string, args?: OrbitValue, timeout?: number) =>
    instance.request('desktop', { action, args: args ?? null }, timeout === undefined ? {} : { timeout });
  return { instance, server, onError, ask, runtime, ...hosted };
}

describe('桌面能力协议（真实 iframe 与端口）', () => {
  it('应用经真实端口调用宿主：已声明的能力成功，参数原样到宿主；宿主推送的事件应用收得到', async () => {
    const { ask, calls, listeners } = await mount(['window', 'menu', 'appearance']);
    expect(await ask('capabilities')).toEqual({ ok: true, value: ['window', 'menu', 'appearance'] });
    expect(await ask('window.getState')).toEqual({ ok: true, value: state });
    expect(await ask('window.setTitle', 'demo — Aiao Code')).toEqual({ ok: true, value: null });
    const menus: DesktopMenu[] = [{ label: 'File', items: [{ id: 'open', label: 'Open…', key: '⌘O' }] }];
    expect(await ask('menu.set', menus as unknown as OrbitValue)).toEqual({ ok: true, value: null });
    expect(await ask('appearance.get')).toEqual({ ok: true, value: look });
    expect(calls).toEqual([
      ['window.getState'],
      ['window.setTitle', 'demo — Aiao Code'],
      ['menu.set', menus],
      ['appearance.get']
    ]);
    for (const listener of listeners.state) listener({ ...state, focused: false });
    for (const listener of listeners.command) listener('open');
    for (const listener of listeners.appearance) listener({ ...look, theme: 'dark' });
    await vi.waitFor(async () => expect(((await ask('events')) as { value: unknown[] }).value).toHaveLength(3));
    expect(await ask('events')).toEqual({
      ok: true,
      value: [
        { event: 'window', state: { ...state, focused: false } },
        { event: 'command', commandId: 'open' },
        { event: 'appearance', appearance: { ...look, theme: 'dark' } }
      ]
    });
  });

  it('默认拒绝：清单没声明的能力稳定返回 CAPABILITY_DENIED，宿主不会被调用，桌面收到 onError', async () => {
    const { ask, calls, onError } = await mount(['window']);
    expect(await ask('menu.set', [])).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(await ask('app.quit')).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(await ask('appearance.set', { appearance: 'dark' })).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(calls).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(DesktopError);
  });

  it('宿主抛出的稳定错误码原样到达应用；不合法的参数在宿主侧被拒绝', async () => {
    const { ask, host, calls } = await mount(['window', 'app']);
    vi.spyOn(host.app, 'focus').mockImplementation(() => {
      throw new DesktopError('USER_CANCELLED', '用户取消');
    });
    expect(await ask('app.focus')).toEqual({ ok: false, code: 'USER_CANCELLED', message: '用户取消' });
    expect(await ask('window.setTitle', 'x'.repeat(257))).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await ask('app.open', 'https://evil.example/')).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(calls).toEqual([]);
  });

  it('请求带的实例 ID 与连接不符：按实例 ID 丢弃，WINDOW_CLOSED，宿主不会被调用', async () => {
    const { ask, calls } = await mount(['window']);
    const stale = await ask('raw', { method: 'desktop.window.setTitle', body: { instanceId: 'w1#0', args: 'late' } });
    expect(stale).toEqual({
      ok: true,
      value: { ok: false, code: 'WINDOW_CLOSED', message: expect.any(String) }
    });
    expect(calls).toEqual([]);
  });

  it('桌面页上的任意 postMessage 绕不过去：能力只经实例专属端口，宿主不会被调用', async () => {
    const { calls } = await mount(['window', 'menu', 'app']);
    const forged = [
      { type: 'request', id: '1', method: 'desktop.app.quit', payload: { instanceId: 'w1#1', args: null } },
      { protocol: 'aiao.orbit:1', type: 'request', method: 'desktop.menu.set', payload: [] },
      { instanceId: 'w1#1', method: 'desktop.window.close' }
    ];
    for (const data of forged)
      window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: location.origin }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(calls).toEqual([]);
  });

  it('通知与剪贴板经真实端口：参数原样到宿主，回执与文本回到应用', async () => {
    const { ask, calls } = await mount(['notification', 'clipboard:read', 'clipboard:write']);
    expect(await ask('notification.post', { title: '构建完成', body: 'main 通过', dedupeKey: 'ci' })).toEqual({
      ok: true,
      value: { id: 'n-1' }
    });
    expect(await ask('clipboard.readText')).toEqual({ ok: true, value: 'pasted' });
    expect(await ask('clipboard.writeText', 'hello')).toEqual({ ok: true, value: null });
    expect(await ask('notification.post', { title: '', body: 'x' })).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(calls).toEqual([
      ['notification.post', { title: '构建完成', body: 'main 通过', dedupeKey: 'ci' }],
      ['clipboard.readText'],
      ['clipboard.writeText', 'hello']
    ]);
  });

  it('文件经真实端口：打开先应答「已受理」，内容经完成事件到达（字节往返）；保存带凭证直接应答', async () => {
    const { ask, calls, onError } = await mount(['filesystem:read', 'filesystem:write']);
    expect(await ask('filesystem.open', { accept: ['.md'] })).toEqual({
      ok: true,
      value: { ...opened, bytes: [104, 101, 108, 108, 111] }
    });
    const bytes = [1, 2, 3, 255];
    expect(await ask('filesystem.save', { handle: 'handle-1', suggestedName: 'notes.md', bytes })).toMatchObject({
      ok: true,
      value: { name: 'notes.md', handle: 'handle-1' }
    });
    expect(
      await ask('filesystem.save', { suggestedName: 'x', bytes: 'not bytes' as unknown as OrbitValue })
    ).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(calls).toEqual([
      ['filesystem.open', { accept: ['.md'] }],
      ['filesystem.save', { handle: 'handle-1', suggestedName: 'notes.md', bytes: Uint8Array.from(bytes) }]
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('用户在面板里停留的时间没有时限：超过应用等应答的兜底时限（callTimeoutMs）仍然成功，不会被 RPC 层的超时打断', async () => {
    const { ask, host } = await mount(['filesystem:read']);
    let choose!: () => void;
    const chosen = new Promise<void>(resolve => (choose = resolve));
    vi.spyOn(host.filesystem, 'open').mockImplementation(async (_options, interaction?: DesktopInteraction) => {
      await interaction!.waitForUser(chosen);
      return opened;
    });
    /* 测试自己问应用的这一问也要放宽时限（默认 5 秒），被测的是应用调桌面能力的那一段。 */
    const result = ask('filesystem.open', undefined, 30_000);
    await new Promise(resolve => setTimeout(resolve, DESKTOP_LIMITS.callTimeoutMs + 500));
    choose();
    expect(await result).toEqual({ ok: true, value: { ...opened, bytes: [104, 101, 108, 108, 111] } });
  }, 20_000);

  it('用户取消与窗口关闭这类稳定错误码经完成事件回到应用，同时通知桌面', async () => {
    const { ask, host, onError } = await mount(['filesystem:read']);
    vi.spyOn(host.filesystem, 'open').mockRejectedValueOnce(new DesktopError('USER_CANCELLED', '用户取消'));
    expect(await ask('filesystem.open')).toEqual({ ok: false, code: 'USER_CANCELLED', message: '用户取消' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_CANCELLED' }), 'filesystem.open');
    vi.spyOn(host.filesystem, 'open').mockRejectedValueOnce(new Error('宿主出错'));
    /* 宿主自己的程序错误不冒充任何能力错误码：应用收到的是处理失败（HANDLER_ERROR）。 */
    await expect(ask('filesystem.open')).rejects.toMatchObject({ code: 'HANDLER_ERROR', message: '宿主出错' });
  });

  it('实例销毁后自动解绑：宿主的订阅取消，宿主再触发事件也不会推给已结束的实例', async () => {
    const { instance, listeners, calls } = await mount(['window', 'menu']);
    expect(listeners.command.size).toBe(1);
    instance.destroy();
    expect(listeners.state.size + listeners.command.size + listeners.appearance.size).toBe(0);
    await expect(instance.request('desktop.window.getState', { instanceId: 'w1#1', args: null })).rejects.toMatchObject(
      {
        code: 'DESTROYED'
      }
    );
    expect(calls).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrbitInstance, OrbitValue } from '../index.js';
import { createOrbit } from '../index.js';
import type { OrbitDragRegion, OrbitWindowHost, OrbitWindowState } from '../window.js';
import { serveWindow, windowProps } from '../window.js';

const resources: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of resources.splice(0).reverse()) cleanup();
});

const initial: OrbitWindowState = {
  platform: 'macos',
  frame: 'transparent',
  decorations: true,
  focused: true,
  maximized: false
};

async function mountWithWindow(props: Record<string, OrbitValue> = windowProps(initial), mode = 'silent') {
  const runtime = createOrbit({ onError: vi.fn() });
  const container = document.createElement('div');
  container.style.cssText = 'width:640px;height:360px';
  document.body.append(container);
  resources.push(() => {
    runtime.dispose();
    container.remove();
  });
  const calls: unknown[][] = [];
  const regions: OrbitDragRegion[][] = [];
  const host: OrbitWindowHost & { current: OrbitWindowState } = {
    current: initial,
    state() {
      return this.current;
    },
    minimize: () => calls.push(['minimize']),
    toggleMaximize: () => calls.push(['toggleMaximize']),
    close: () => calls.push(['close']),
    setTitle: title => calls.push(['setTitle', title]),
    setDecorations: decorations => calls.push(['setDecorations', decorations]),
    setDragRegions: next => regions.push([...next])
  };
  const instance: OrbitInstance = runtime.createApp({
    appId: 'window',
    instanceId: crypto.randomUUID(),
    version: '1',
    url: new URL(`/test-app/app.html?mode=${mode}`, location.href).href,
    timeout: 5000,
    props
  });
  const server = serveWindow(instance, host);
  const pending = instance.mount(container);
  const ask = (action: string, value?: OrbitValue) => instance.request('window', { action, value: value ?? null });
  /** 静默模式的应用不报告就绪：握手完成前宿主发不出请求，重试到连上为止。 */
  const connected = () => vi.waitFor(() => ask('state'), { timeout: 5000 });
  return { instance, server, host, calls, regions, ask, connected, pending };
}

describe('窗口协议（真实 iframe）', () => {
  it('应用经真实端口调用宿主的窗口操作，宿主就绪后推送的状态应用收得到', async () => {
    const { instance, server, calls, ask, connected } = await mountWithWindow();
    expect(await connected()).toEqual(initial);
    expect(instance.snapshot.state).toBe('loading');
    for (const action of ['minimize', 'toggleMaximize', 'close']) expect(await ask(action)).toBe('ok');
    expect(await ask('setTitle', 'demo')).toBe('ok');
    expect(await ask('setDecorations', false)).toBe('ok');
    expect(calls).toEqual([
      ['minimize'],
      ['toggleMaximize'],
      ['close'],
      ['setTitle', 'demo'],
      ['setDecorations', false]
    ]);
    server.publish();
    expect(await ask('events')).toEqual([]);
  });

  it('应用就绪后宿主推送窗口状态，相同状态不重复推送', async () => {
    const { server, host, ask, pending } = await mountWithWindow(windowProps(initial), 'ready');
    await pending;
    server.publish();
    server.publish();
    host.current = { ...initial, focused: false, maximized: true };
    server.publish();
    await vi.waitFor(async () => expect(await ask('events')).toHaveLength(2));
    expect(await ask('events')).toEqual([initial, host.current]);
    expect(await ask('state')).toEqual(host.current);
  });

  it('拖动区：整条标题栏可拖，挖掉其中的按钮；布局变化后重新上报，停止时清空', async () => {
    const { regions, ask, connected } = await mountWithWindow();
    await connected();
    await ask('drag');
    await vi.waitFor(() => expect(regions.length).toBeGreaterThan(0));
    const first = (await ask('rects')) as { bar: OrbitValue; button: OrbitValue };
    expect(regions.at(-1)).toEqual([{ ...(first.bar as object), holes: [first.button] }]);
    await ask('grow');
    await vi.waitFor(() => expect((regions.at(-1)![0]!.holes[0] as { width: number }).width).toBe(120));
    await ask('stop');
    await vi.waitFor(() => expect(regions.at(-1)).toEqual([]));
  });

  it('宿主不提供窗口时，应用拿不到窗口', async () => {
    const { connected } = await mountWithWindow({ theme: 'dark' });
    expect(await connected()).toBe('no-window');
  });
});

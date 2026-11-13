import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../bus.js';
import { OrbitError } from '../errors.js';
import type { OrbitClient, OrbitInstance, OrbitRequestHandler, OrbitState, OrbitValue } from '../types.js';
import type { OrbitDragRegion, OrbitWindowHost, OrbitWindowState } from '../window.js';
import { WINDOW_PROP, getCurrentWindow, serveWindow, windowProps } from '../window.js';

const initial: OrbitWindowState = {
  platform: 'macos',
  frame: 'transparent',
  decorations: true,
  focused: true,
  maximized: false
};

/** 内存里的一对宿主实例与子应用连接：请求直接交给宿主处理函数，宿主事件直接派发到子应用总线。 */
function connect(props: Record<string, OrbitValue> = windowProps(initial), state: OrbitState = 'ready') {
  const handlers = new Map<string, OrbitRequestHandler>();
  const bus = new EventBus(() => undefined);
  let current = state;
  const instance = {
    get snapshot() {
      return { appId: 'code', instanceId: 'w1', version: '1', url: 'https://code.example/', state: current };
    },
    onRequest(method: string, handler: OrbitRequestHandler) {
      handlers.set(method, handler);
      return () => handlers.delete(method);
    },
    emit(event: string, ...args: OrbitValue[]) {
      bus.dispatch(event, args);
    }
  } as unknown as OrbitInstance;
  const client = {
    context: { props },
    bus,
    async request(method: string, payload: OrbitValue = null) {
      const handler = handlers.get(method);
      if (!handler) throw new OrbitError('UNKNOWN_METHOD', `未知操作：${method}`);
      try {
        return await handler(JSON.parse(JSON.stringify(payload)) as OrbitValue, new AbortController().signal);
      } catch (error) {
        throw new OrbitError('HANDLER_ERROR', error instanceof Error ? error.message : '请求处理失败');
      }
    }
  } as unknown as OrbitClient;
  return { instance, client, handlers, setState: (next: OrbitState) => (current = next) };
}

function host(state: OrbitWindowState = initial): OrbitWindowHost & { calls: unknown[][]; current: OrbitWindowState } {
  const calls: unknown[][] = [];
  return {
    calls,
    current: state,
    state() {
      return this.current;
    },
    minimize: () => calls.push(['minimize']),
    toggleMaximize: () => calls.push(['toggleMaximize']),
    close: () => calls.push(['close']),
    setTitle: title => calls.push(['setTitle', title]),
    setDecorations(decorations) {
      if (!decorations && this.current.frame !== 'transparent') throw new Error('标准窗口不能隐藏桌面的标题栏');
      calls.push(['setDecorations', decorations]);
    },
    setDragRegions: regions => calls.push(['setDragRegions', regions])
  };
}

describe('窗口协议（对齐 Tauri 的 getCurrentWindow）', () => {
  it('宿主没有提供窗口时得到 undefined，应用按普通网页运行', () => {
    expect(getCurrentWindow(connect({ theme: 'dark' }).client)).toBeUndefined();
  });

  it('初始状态来自启动属性，窗口操作只作用于宿主给的这个窗口', async () => {
    const { instance, client } = connect();
    const windowHost = host();
    serveWindow(instance, windowHost);
    const appWindow = getCurrentWindow(client)!;
    expect(appWindow.state).toEqual(initial);
    await appWindow.minimize();
    await appWindow.toggleMaximize();
    await appWindow.setTitle('demo — Aiao Code');
    await appWindow.setDecorations(false);
    await appWindow.close();
    expect(windowHost.calls).toEqual([
      ['minimize'],
      ['toggleMaximize'],
      ['setTitle', 'demo — Aiao Code'],
      ['setDecorations', false],
      ['close']
    ]);
  });

  it('宿主拒绝的操作原样把原因回给应用；不合法的参数在宿主侧拒绝', async () => {
    const { instance, client, handlers } = connect(windowProps({ ...initial, frame: 'standard' }));
    serveWindow(instance, host({ ...initial, frame: 'standard' }));
    const appWindow = getCurrentWindow(client)!;
    await expect(appWindow.setDecorations(false)).rejects.toThrow('标准窗口不能隐藏桌面的标题栏');
    const signal = new AbortController().signal;
    expect(() => handlers.get('window.setDecorations')!('no', signal)).toThrow(OrbitError);
    expect(() => handlers.get('window.setTitle')!(42, signal)).toThrow(OrbitError);
    expect(() => handlers.get('window.setTitle')!('x'.repeat(257), signal)).toThrow(OrbitError);
    expect(() =>
      handlers.get('window.setDragRegions')!([{ x: 0, y: 0, width: -1, height: 1, holes: [] }], signal)
    ).toThrow(OrbitError);
    expect(() => handlers.get('window.setDragRegions')!({}, signal)).toThrow(OrbitError);
  });

  it('拖动区按形状交给宿主：矩形加挖空的可交互元素', async () => {
    const { instance, client } = connect();
    const windowHost = host();
    serveWindow(instance, windowHost);
    const regions: OrbitDragRegion[] = [
      { x: 0, y: 0, width: 800, height: 36, holes: [{ x: 70, y: 4, width: 28, height: 28 }] }
    ];
    await client.request('window.setDragRegions', regions as unknown as OrbitValue);
    expect(windowHost.calls).toEqual([['setDragRegions', regions]]);
  });

  it('宿主就绪后推送状态变化，相同状态不重复推送；应用可以退订', () => {
    const { instance, client, setState } = connect(windowProps(initial), 'loading');
    const windowHost = host();
    const server = serveWindow(instance, windowHost);
    const appWindow = getCurrentWindow(client)!;
    const seen = vi.fn();
    const off = appWindow.onStateChange(seen);
    server.publish();
    expect(seen).not.toHaveBeenCalled();
    setState('ready');
    server.publish();
    server.publish();
    windowHost.current = { ...initial, focused: false };
    server.publish();
    expect(seen.mock.calls.map(([state]) => state)).toEqual([initial, { ...initial, focused: false }]);
    expect(appWindow.state).toEqual({ ...initial, focused: false });
    off();
    windowHost.current = { ...initial, maximized: true };
    server.publish();
    expect(seen).toHaveBeenCalledTimes(2);
    expect(appWindow.state.maximized).toBe(true);
  });

  it('宿主给出的状态不合法时拒绝，不带着错误的窗口启动', () => {
    expect(() => getCurrentWindow(connect({ [WINDOW_PROP]: { ...initial, frame: 'glass' } }).client)).toThrow(
      OrbitError
    );
    expect(() => getCurrentWindow(connect({ [WINDOW_PROP]: 'macos' }).client)).toThrow(OrbitError);
  });

  it('释放后不再处理窗口请求', async () => {
    const { instance, client } = connect();
    const server = serveWindow(instance, host());
    server.dispose();
    await expect(getCurrentWindow(client)!.minimize()).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
  });
});

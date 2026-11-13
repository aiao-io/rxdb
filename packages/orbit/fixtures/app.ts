import { connectOrbitClient } from '../src/client.js';
import { DesktopError, getDesktop } from '../src/desktop.js';
import type { OrbitValue } from '../src/types.js';
import { getCurrentWindow } from '../src/window.js';

const mode = new URL(location.href).searchParams.get('mode');

/**
 * 声明更高协议版本的应用（模拟用更新的 SDK 构建）：自己发握手，不经本仓的 SDK；
 * 收到宿主的不兼容通知后转告父页面，测试据此确认「应用收到了明确的不兼容错误」。
 */
if (mode === 'future') {
  const channel = new URL(location.href).searchParams.get('__aiao_orbit');
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'incompatible') return;
    parent.postMessage({ fixture: 'incompatible', notice: event.data }, '*');
  });
  parent.postMessage({ protocol: 'aiao.orbit:2', type: 'hello', channel }, '*');
}
const client = mode === 'future' ? undefined : await connectOrbitClient();
if (client) {
  const events: unknown[] = [];
  const id = crypto.randomUUID();
  Reflect.set(window, 'fixtureIdentity', id);
  client.bus.$on('host-event', (...args) => events.push(args));
  client.onRequest('inspect', () => ({
    id,
    events: JSON.stringify(events),
    props: { ...client.context.props },
    visible: client.context.visible,
    url: location.href,
    color: getComputedStyle(document.body).color,
    text: document.getElementById('root')!.textContent
  }));
  client.onRequest('echo', payload => payload);
  client.onRequest(
    'slow',
    (_payload, signal) =>
      new Promise(resolve => {
        signal.addEventListener(
          'abort',
          () => {
            client.bus.$emit('cancelled', client.context.instanceId);
            resolve(null);
          },
          { once: true }
        );
      })
  );
  client.onRequest('throw', () => {
    throw new Error('应用处理错误');
  });
  client.onRequest('invalid', () => undefined as never);
  client.onRequest('emit', payload => {
    client.bus.$emit('app-event', payload);
    return null;
  });
  client.onRequest('host', payload => client.request('host', payload));
  client.onRequest('lazy', async () => (await import('./lazy.js')).loaded);
  client.onRequest('route', () => {
    history.pushState(null, '', '#new-route');
    return location.hash;
  });
  client.onRequest('fail', () => {
    client.fail('业务启动失败');
    return null;
  });
  const appWindow = getCurrentWindow(client);
  const windowStates: OrbitValue[] = [];
  let stopTracking: (() => void) | undefined;
  appWindow?.onStateChange(state => windowStates.push({ ...state }));
  const rect = (selector: string) => {
    const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect();
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  };
  client.onRequest('window', async (payload): Promise<OrbitValue> => {
    if (!appWindow) return 'no-window';
    const { action, value } = payload as { action: string; value?: OrbitValue };
    if (action === 'state') return { ...appWindow.state };
    if (action === 'events') return windowStates;
    if (action === 'rects')
      return { bar: rect('[data-orbit-drag-region]'), button: rect('[data-orbit-drag-region] button') };
    if (action === 'drag') {
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<header data-orbit-drag-region style="display:flex;align-items:center;gap:8px;height:36px;padding-left:72px"><button style="width:40px;height:24px">b</button><span>title</span></header>'
      );
      stopTracking = appWindow.trackDragRegions(document);
      return null;
    }
    if (action === 'grow') {
      document.querySelector<HTMLElement>('[data-orbit-drag-region] button')!.style.width = '120px';
      return null;
    }
    if (action === 'stop') {
      stopTracking?.();
      return null;
    }
    const actions: Record<string, () => Promise<void>> = {
      minimize: () => appWindow.minimize(),
      toggleMaximize: () => appWindow.toggleMaximize(),
      close: () => appWindow.close(),
      setTitle: () => appWindow.setTitle(String(value)),
      setDecorations: () => appWindow.setDecorations(value === true)
    };
    await actions[action]!();
    return 'ok';
  });
  const desktop = getDesktop(client);
  const desktopEvents: OrbitValue[] = [];
  desktop?.window.onStateChange(state => desktopEvents.push({ event: 'window', state: { ...state } }));
  desktop?.menu.onCommand(commandId => desktopEvents.push({ event: 'command', commandId }));
  desktop?.appearance.onChange(appearance =>
    desktopEvents.push({ event: 'appearance', appearance: { ...appearance } })
  );
  /** 经 `getDesktop` 调桌面能力，把成功值或稳定错误码当结果返回给测试页面。 */
  client.onRequest('desktop', async (payload): Promise<OrbitValue> => {
    if (!desktop) return { ok: false, code: 'NO_DESKTOP', message: '宿主没有提供桌面能力' };
    const { action, args } = payload as { action: string; args?: OrbitValue };
    if (action === 'events') return { ok: true, value: desktopEvents };
    if (action === 'capabilities') return { ok: true, value: [...desktop.capabilities] };
    if (action === 'raw') {
      const { method, body } = args as { method: string; body: OrbitValue };
      return { ok: true, value: await client.request(method, body) };
    }
    const area = action.split('.')[0] as 'window' | 'menu' | 'app' | 'appearance';
    const calls = desktop[area] as unknown as Record<string, (value?: unknown) => Promise<OrbitValue>>;
    try {
      const value = await calls[action.split('.')[1]!]!(args);
      return { ok: true, value: value ?? null };
    } catch (error) {
      if (error instanceof DesktopError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  });
  client.onPropsChange(() => client.bus.$emit('props-changed'));
  client.onVisibilityChange(visible => client.bus.$emit('visible', visible));
  document.getElementById('root')!.textContent = client.context.instanceId;
  if (mode === 'fail') client.fail('业务启动失败');
  else if (mode !== 'silent')
    await (await import('./render.js')).render(client, new URL(location.href).searchParams.get('framework'));
}

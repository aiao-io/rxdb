import { connectOrbitClient } from '../src/client.js';
import type { OrbitValue } from '../src/types.js';
import { getCurrentWindow } from '../src/window.js';

const mode = new URL(location.href).searchParams.get('mode');
const client = await connectOrbitClient();
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
    if (action === 'rects') return { bar: rect('[data-orbit-drag-region]'), button: rect('[data-orbit-drag-region] button') };
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
  client.onPropsChange(() => client.bus.$emit('props-changed'));
  client.onVisibilityChange(visible => client.bus.$emit('visible', visible));
  document.getElementById('root')!.textContent = client.context.instanceId;
  if (mode === 'fail') client.fail('业务启动失败');
  else if (mode !== 'silent')
    await (await import('./render.js')).render(client, new URL(location.href).searchParams.get('framework'));
}

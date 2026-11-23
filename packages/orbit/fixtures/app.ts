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
/**
 * 只接受指定来源嵌入的应用：`?mode=trusted&trust=<来源>&wait=<握手超时毫秒>`，对应真实应用里的 `acceptHostOrigin`。
 * 握手失败时把错误码转告父页面，测试据此确认「应用没有与来源不对的宿主握手」。
 */
async function connectTrusted() {
  const query = new URL(location.href).searchParams;
  const trust = query.get('trust');
  try {
    return await connectOrbitClient({
      timeout: Number(query.get('wait') ?? 15_000),
      acceptHostOrigin: origin => origin === trust
    });
  } catch (error) {
    parent.postMessage({ fixture: 'untrusted-host', code: (error as { code?: string }).code }, '*');
    return undefined;
  }
}
const [client, second] = await Promise.all([
  mode === 'future' ? undefined
  : mode === 'trusted' ? connectTrusted()
  : connectOrbitClient(),
  mode === 'parallel' ? connectOrbitClient() : undefined
]);
if (client) {
  if (second) client.onRequest('parallel', () => Promise.all([client.request('echo', 0), second.request('echo', 1)]));
  const events: unknown[] = [];
  const id = crypto.randomUUID();
  Reflect.set(window, 'fixtureIdentity', id);
  client.bus.$on('host-event', (...args) => events.push(args));
  client.onRequest('inspect', () => ({
    id,
    hostOrigin: client.context.hostOrigin,
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
  if (mode === 'open-first') await desktop!.filesystem.open();
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
    const area = action.split('.')[0] as
      'window' | 'menu' | 'app' | 'appearance' | 'notification' | 'clipboard' | 'filesystem' | 'workspace';
    const calls = desktop[area] as unknown as Record<string, (value?: unknown) => Promise<unknown>>;
    try {
      /* 字节数组不是 JSON：测试页面用数字数组表示，这里转成真正的 Uint8Array 再调，结果里的字节数组再转回数字数组。 */
      const bytes = (args as { bytes?: unknown } | null)?.bytes;
      const input = Array.isArray(bytes) ? { ...(args as object), bytes: Uint8Array.from(bytes as number[]) } : args;
      const value = await calls[action.split('.')[1]!]!(input);
      const output =
        value && typeof value === 'object' && (value as { bytes?: unknown }).bytes instanceof Uint8Array ?
          { ...value, bytes: Array.from((value as { bytes: Uint8Array }).bytes) }
        : value;
      return { ok: true, value: (output ?? null) as OrbitValue };
    } catch (error) {
      if (error instanceof DesktopError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  });
  /** 同一连接上两处各自 `getDesktop` 得到工作区，再并发调用：它们必须共用一个发送队列。 */
  client.onRequest('workspace-parallel', async (payload): Promise<OrbitValue> => {
    const { first, second } = payload as { first: OrbitValue; second: OrbitValue };
    const call = (request: OrbitValue) => getDesktop(client)!.workspace.call(request as never);
    const results = await Promise.allSettled([call(first), call(second)]);
    return results.map((result): OrbitValue =>
      result.status === 'fulfilled' ?
        { ok: true, value: result.value }
      : { ok: false, code: result.reason instanceof DesktopError ? result.reason.code : 'ERROR' }
    );
  });
  client.onPropsChange(() => client.bus.$emit('props-changed'));
  client.onVisibilityChange(visible => client.bus.$emit('visible', visible));
  document.getElementById('root')!.textContent = client.context.instanceId;
  if (mode === 'fail') client.fail('业务启动失败');
  else if (mode !== 'silent')
    await (await import('./render.js')).render(client, new URL(location.href).searchParams.get('framework'));
}

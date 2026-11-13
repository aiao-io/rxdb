import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectOrbitClient } from '../client.js';
import { CHANNEL_PARAM, PROTOCOL } from '../protocol.js';

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of disposals.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function environment() {
  const parent = { postMessage: vi.fn() };
  const fake = Object.assign(new EventTarget(), {
    parent,
    location: { href: `https://apps.example/?keep=yes&${CHANNEL_PARAM}=token#hash` },
    history: { state: { retained: true }, replaceState: vi.fn() }
  });
  vi.stubGlobal('window', fake);
  const context = {
    appId: 'app',
    instanceId: 'instance',
    version: '1',
    url: 'https://apps.example/',
    props: { theme: 'dark' },
    visible: true
  };
  const channel = new MessageChannel();
  disposals.push(() => {
    channel.port1.close();
    channel.port2.close();
  });
  const init = (changes: Record<string, unknown> = {}, source: unknown = parent, value: unknown = context) => {
    const event = Object.assign(new Event('message'), {
      source,
      data: { protocol: PROTOCOL, type: 'init', channel: 'token', context: value, ...changes },
      ports: [channel.port1],
      origin: 'https://desktop.example'
    });
    fake.dispatchEvent(event);
  };
  return { fake, parent, init, context, port: channel.port2 };
}

async function connected() {
  const env = environment();
  const onError = vi.fn();
  const promise = connectOrbitClient({ onError });
  env.init();
  const client = (await promise)!;
  disposals.push(() => client.dispose());
  return { ...env, client, onError };
}

describe('子应用 SDK', () => {
  it('独立页面和普通 iframe 无副作用，握手前取消立即失败', async () => {
    const { fake } = environment();
    fake.location.href = 'https://apps.example/';
    expect(await connectOrbitClient()).toBeUndefined();
    Reflect.set(fake, 'parent', fake);
    expect(await connectOrbitClient()).toBeUndefined();
    const env = environment();
    const controller = new AbortController();
    controller.abort();
    await expect(connectOrbitClient({ signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(env.parent.postMessage).not.toHaveBeenCalled();
  });

  it('只接受父窗口与正确令牌、协议和上下文；握手移除内部参数', async () => {
    const env = environment();
    const promise = connectOrbitClient();
    env.init({}, {});
    env.init({ channel: 'wrong' });
    env.init({ protocol: 'other' });
    env.init({}, env.parent, {});
    env.init();
    const client = (await promise)!;
    disposals.push(() => client.dispose());
    expect(client.context).toMatchObject(env.context);
    expect(env.fake.history.replaceState).toHaveBeenCalledWith(
      { retained: true },
      '',
      'https://apps.example/?keep=yes#hash'
    );
    expect(Reflect.get(env.fake, '__ORBIT')).toEqual({ id: 'instance' });
    expect(Reflect.get(env.fake, '$orbit')).toMatchObject({ props: { theme: 'dark' } });
  });

  it('宿主通知协议不兼容：握手以 INCOMPATIBLE_PROTOCOL 失败，带双方版本；来源或令牌不对的通知不算', async () => {
    /* 本 SDK 声明的是版本 1，现实里不会有宿主对它说“不兼容”；这里只验证 SDK 读得懂这条通知，数字只做形式校验。 */
    const env = environment();
    const promise = connectOrbitClient();
    const incompatible = (changes: Record<string, unknown> = {}, source: unknown = env.parent) =>
      env.fake.dispatchEvent(
        Object.assign(new Event('message'), {
          source,
          data: {
            protocol: PROTOCOL,
            type: 'incompatible',
            channel: 'token',
            supported: 1,
            requested: 1,
            message: '宿主说',
            ...changes
          },
          ports: [],
          origin: 'https://desktop.example'
        })
      );
    incompatible({}, {});
    incompatible({ channel: 'wrong' });
    incompatible({ supported: 'x' });
    incompatible({ supported: 1.5 });
    incompatible({ supported: 0 });
    incompatible({ supported: -1 });
    incompatible({ requested: 2 });
    incompatible({ protocol: 'other' });
    const settled = vi.fn();
    void promise.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    incompatible();
    await expect(promise).rejects.toMatchObject({ code: 'INCOMPATIBLE_PROTOCOL', requested: 1, supported: 1 });
    expect(env.fake.history.replaceState).not.toHaveBeenCalled();
  });

  it('握手超时、主动取消和离开页面均移除启动监听', async () => {
    vi.useFakeTimers();
    environment();
    const timed = expect(connectOrbitClient({ timeout: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await timed;
    const env = environment();
    const controller = new AbortController();
    const pending = connectOrbitClient({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    const leaving = connectOrbitClient();
    env.fake.dispatchEvent(new Event('pagehide'));
    await expect(leaving).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('属性、可见性和事件通知；异常显式报告，取消订阅有效', async () => {
    const { client, port, onError } = await connected();
    const props = vi.fn();
    const visibility = vi.fn();
    const event = vi.fn();
    const removed = vi.fn();
    client.onPropsChange(props);
    client.onPropsChange(removed)();
    client.onPropsChange(() => {
      throw new Error('props');
    });
    client.onVisibilityChange(visibility);
    client.onVisibilityChange(removed)();
    client.bus.$on('incoming', event).$on('incoming', () => {
      throw new Error('event');
    });
    port.postMessage({ type: 'props', props: { theme: 'light' } });
    port.postMessage({ type: 'visibility', visible: false });
    port.postMessage({ type: 'event', event: 'incoming', args: [1] });
    port.postMessage({ type: 'unknown' });
    port.postMessage({ type: 'props', props: { bad: new Date() } });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(3));
    expect(props).toHaveBeenCalledWith({ theme: 'light' });
    expect(visibility).toHaveBeenCalledWith(false);
    expect(event).toHaveBeenCalledWith(1);
    expect(removed).not.toHaveBeenCalled();
    expect(client.context).toMatchObject({ props: { theme: 'light' }, visible: false });
  });

  it('显式就绪幂等，双向 RPC 和事件同用专属端口', async () => {
    const { client, port } = await connected();
    const messages: unknown[] = [];
    port.onmessage = event => {
      messages.push(event.data);
      if (event.data.type === 'request') port.postMessage({ type: 'response', id: event.data.id, value: 42 });
    };
    client.ready();
    client.ready();
    client.bus.$emit('outgoing', 'x');
    client.fail('bad');
    expect(await client.request('host')).toBe(42);
    const off = client.onRequest('child', payload => payload);
    port.postMessage({ type: 'request', id: 'host1', method: 'child', payload: 8 });
    await vi.waitFor(() => expect(messages).toContainEqual({ type: 'response', id: 'host1', value: 8 }));
    expect(messages.filter(value => (value as { type: string }).type === 'ready')).toHaveLength(1);
    expect(messages).toContainEqual({ type: 'event', event: 'outgoing', args: ['x'] });
    expect(messages).toContainEqual({ type: 'error', message: 'bad' });
    off();
  });

  it('销毁恢复原全局，拒绝在途请求且清空回调；宿主也可主动销毁', async () => {
    const env = environment();
    Object.defineProperty(env.fake, '$orbit', { configurable: true, value: 'previous' });
    const promise = connectOrbitClient();
    env.init();
    const client = (await promise)!;
    const disposed = vi.fn();
    const removed = vi.fn();
    client.onDispose(disposed);
    client.onDispose(removed)();
    const pending = client.request('pending');
    env.port.postMessage({ type: 'disposed' });
    await expect(pending).rejects.toMatchObject({ code: 'DESTROYED' });
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    expect(Reflect.get(env.fake, '$orbit')).toBe('previous');
    expect(Reflect.has(env.fake, '__ORBIT')).toBe(false);
    client.dispose();
    expect(client.bus.listenerCount).toBe(0);
    expect(() => client.ready()).toThrow();
    expect(() => client.onPropsChange(() => undefined)).toThrow();
  });

  it('全局冲突使握手明确失败，连接后的 abort 销毁 SDK', async () => {
    const env = environment();
    Object.defineProperty(env.fake, '$orbit', { configurable: false, value: 'occupied' });
    const failed = connectOrbitClient();
    env.init();
    await expect(failed).rejects.toBeInstanceOf(TypeError);
    expect(Reflect.get(env.fake, '$orbit')).toBe('occupied');
    const next = environment();
    const controller = new AbortController();
    const promise = connectOrbitClient({ signal: controller.signal });
    next.init();
    const client = (await promise)!;
    controller.abort();
    expect(() => client.ready()).toThrow();
  });
});

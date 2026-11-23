import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectOrbitClient } from '../client.js';
import { CHANNEL_PARAM, PROTOCOL } from '../protocol.js';

/** 测试里的宿主（桌面）页面来源。 */
const HOST_ORIGIN = 'https://desktop.example';
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
  const init = (
    changes: Record<string, unknown> = {},
    source: unknown = parent,
    value: unknown = context,
    origin = HOST_ORIGIN
  ) => {
    const event = Object.assign(new Event('message'), {
      source,
      data: { protocol: PROTOCOL, type: 'init', channel: 'token', context: value, ...changes },
      ports: [channel.port1],
      origin
    });
    fake.dispatchEvent(event);
  };
  /** 宿主的不兼容通知：与 init 一样只认父窗口、令牌和（若设置了准入）宿主来源。 */
  const incompatible = (changes: Record<string, unknown> = {}, source: unknown = parent, origin = HOST_ORIGIN) =>
    fake.dispatchEvent(
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
        origin
      })
    );
  return { fake, parent, init, incompatible, context, port: channel.port2 };
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
    const { incompatible } = env;
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

describe('宿主来源（握手只信浏览器给出的 event.origin）', () => {
  it('上下文带经校验的宿主来源：取自握手消息的 event.origin，宿主在 context 里自报的同名字段无效', async () => {
    const env = environment();
    const promise = connectOrbitClient();
    env.init({}, env.parent, { ...env.context, hostOrigin: 'https://trusted.example' }, 'https://evil.example');
    const client = (await promise)!;
    disposals.push(() => client.dispose());
    expect(client.context.hostOrigin).toBe('https://evil.example');
    expect(Object.isFrozen(client.context)).toBe(true);
  });

  it('属性与可见性更新之后宿主来源不变', async () => {
    const { client, port, onError } = await connected();
    expect(client.context.hostOrigin).toBe(HOST_ORIGIN);
    port.postMessage({ type: 'props', props: { theme: 'light' } });
    port.postMessage({ type: 'visibility', visible: false });
    await vi.waitFor(() => expect(client.context).toMatchObject({ props: { theme: 'light' }, visible: false }));
    expect(client.context.hostOrigin).toBe(HOST_ORIGIN);
    expect(onError).not.toHaveBeenCalled();
  });

  it('省略准入判定：行为不变，任何来源的父窗口都能完成握手（调用方自行决定是否信任 hostOrigin）', async () => {
    const env = environment();
    const promise = connectOrbitClient();
    env.init({}, env.parent, env.context, 'https://anywhere.example');
    const client = (await promise)!;
    disposals.push(() => client.dispose());
    expect(client.context.hostOrigin).toBe('https://anywhere.example');
  });

  it('设置了来源准入：不被接受的来源发来的 init 与不兼容通知一律忽略，通过的来源才能完成握手', async () => {
    const env = environment();
    const accept = vi.fn((origin: string) => origin === HOST_ORIGIN);
    const promise = connectOrbitClient({ acceptHostOrigin: accept });
    env.init({}, env.parent, env.context, 'https://evil.example');
    env.init({}, env.parent, env.context, 'null');
    env.incompatible({}, env.parent, 'https://evil.example');
    const settled = vi.fn();
    void promise.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(env.fake.history.replaceState).not.toHaveBeenCalled();
    expect(Reflect.has(env.fake, '__ORBIT')).toBe(false);
    expect(accept.mock.calls.map(([origin]) => origin)).toEqual([
      'https://evil.example',
      'null',
      'https://evil.example'
    ]);
    env.init();
    const client = (await promise)!;
    disposals.push(() => client.dispose());
    expect(client.context.hostOrigin).toBe(HOST_ORIGIN);
  });

  it('来源准入不改变既有的父窗口与令牌校验：来源对也要来自父窗口、带对令牌', async () => {
    const env = environment();
    const promise = connectOrbitClient({ acceptHostOrigin: origin => origin === HOST_ORIGIN });
    env.init({}, {});
    env.init({ channel: 'wrong' });
    env.incompatible({}, {});
    const settled = vi.fn();
    void promise.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    env.incompatible();
    await expect(promise).rejects.toMatchObject({ code: 'INCOMPATIBLE_PROTOCOL' });
  });

  it('没有来源通过准入：按握手超时失败，不暴露任何全局，也不改地址', async () => {
    vi.useFakeTimers();
    const env = environment();
    const timed = expect(connectOrbitClient({ timeout: 10, acceptHostOrigin: () => false })).rejects.toMatchObject({
      code: 'TIMEOUT'
    });
    env.init();
    await vi.advanceTimersByTimeAsync(10);
    await timed;
    expect(env.fake.history.replaceState).not.toHaveBeenCalled();
    expect(Reflect.has(env.fake, '$orbit')).toBe(false);
  });

  it('准入判定自己抛错是程序错误：握手以该错误失败并关闭转交的端口，不当作拒绝来源静默等到超时', async () => {
    const env = environment();
    const failure = new Error('判定出错');
    const promise = connectOrbitClient({
      acceptHostOrigin: () => {
        throw failure;
      }
    });
    env.init();
    await expect(promise).rejects.toBe(failure);
    expect(env.fake.history.replaceState).not.toHaveBeenCalled();
    /* 失败后可以重新握手。 */
    const next = connectOrbitClient({ acceptHostOrigin: () => true });
    env.init();
    const client = (await next)!;
    disposals.push(() => client.dispose());
  });

  it('复用连接时不能重新指定来源准入，与超时、取消、错误回调一样由首次调用决定', async () => {
    const env = environment();
    const first = connectOrbitClient({ acceptHostOrigin: origin => origin === HOST_ORIGIN });
    env.init();
    const client = (await first)!;
    disposals.push(() => client.dispose());
    await expect(connectOrbitClient({ acceptHostOrigin: () => true })).rejects.toMatchObject({
      code: 'INVALID_STATE'
    });
    expect(await connectOrbitClient()).toBe(client);
  });
});

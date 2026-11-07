import { afterEach, describe, expect, inject, it, vi } from 'vitest';
import type { OrbitAppOptions, OrbitInstance, OrbitValue } from '../index.js';
import { createOrbit, createOrbitBinding } from '../index.js';
import { CHANNEL_PARAM, PROTOCOL } from '../protocol.js';

declare module 'vitest' {
  export interface ProvidedContext {
    fixtureOrigin: string;
  }
}

const resources: (() => void)[] = [];
function setup(mode = '') {
  const report = vi.fn();
  const runtime = createOrbit({ onError: report });
  const container = document.createElement('div');
  document.body.append(container);
  resources.push(() => {
    runtime.dispose();
    container.remove();
  });
  const options: OrbitAppOptions = {
    appId: 'test',
    instanceId: crypto.randomUUID(),
    version: '1',
    url: new URL(`/test-app/app.html${mode ? '?mode=' + mode : ''}`, location.href).href,
    timeout: 5000,
    props: { theme: 'dark' }
  };
  return { runtime, container, options, report };
}
async function inspect(instance: OrbitInstance): Promise<Record<string, OrbitValue>> {
  return (await instance.request('inspect')) as Record<string, OrbitValue>;
}
afterEach(() => {
  for (const cleanup of resources.splice(0).reverse()) cleanup();
});

describe('原生 iframe 运行内核', () => {
  it('装载、显式就绪、重复装载复用、属性、事件、双向请求、相对资源与动态导入', async () => {
    const { runtime, container, options } = setup();
    const instance = runtime.createApp(options);
    const states: string[] = [];
    const unsub = instance.subscribe(snapshot => states.push(snapshot.state));
    const ready = instance.mount(container);
    expect(instance.mount(container)).toBe(ready);
    await ready;
    expect(states).toEqual(['loading', 'ready']);
    expect(instance.snapshot.state).toBe('ready');
    expect(runtime.instances).toHaveLength(1);
    const initial = await inspect(instance);
    expect(initial['props']).toEqual({ theme: 'dark' });
    expect(initial['color']).toBe('rgb(17, 34, 51)');
    expect(initial['url']).not.toContain(CHANNEL_PARAM);
    expect(initial['text']).toBe(options.instanceId);
    expect(await instance.request('lazy')).toBe('原生动态导入成功');
    expect(await instance.request('route')).toBe('#new-route');
    const propsChanged = new Promise(resolve => runtime.bus.$once('props-changed', resolve));
    instance.setProps({ theme: 'light' });
    await propsChanged;
    runtime.bus.$emit('host-event', 'broadcast');
    instance.emit('host-event', 'direct');
    expect((await inspect(instance))['events']).toBe('[["broadcast"],["direct"]]');
    const received = new Promise(resolve => runtime.bus.$once('app-event', resolve));
    await instance.request('emit', { ok: true });
    expect(await received).toEqual({ ok: true });
    const off = instance.onRequest('host', payload => payload);
    expect(await instance.request('host', 12)).toBe(12);
    off();
    await expect(instance.request('host', 12)).rejects.toMatchObject({ code: 'HANDLER_ERROR' });
    await expect(instance.request('missing')).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
    await expect(instance.request('throw')).rejects.toMatchObject({ code: 'HANDLER_ERROR' });
    await expect(instance.request('invalid')).rejects.toMatchObject({ code: 'HANDLER_ERROR' });
    unsub();
    instance.destroy();
    instance.destroy();
    expect(runtime.instances).toEqual([]);
    expect(container.children).toHaveLength(0);
    expect(() => instance.emit('x')).toThrow();
    await expect(instance.request('x')).rejects.toMatchObject({ code: 'DESTROYED' });
  });

  it('隐藏与恢复保留同一个页面，不重载；两个实例的 DOM、JS、事件独立', async () => {
    const { runtime, container, options } = setup();
    const secondContainer = document.createElement('div');
    container.append(secondContainer);
    const first = runtime.createApp(options);
    const second = runtime.createApp({ ...options, instanceId: 'second' });
    await Promise.all([first.mount(container), second.mount(secondContainer)]);
    const initial = await inspect(first);
    first.hide();
    expect(first.snapshot.state).toBe('hidden');
    expect((await inspect(first))['visible']).toBe(false);
    first.show();
    expect((await inspect(first))['id']).toBe(initial['id']);
    expect((await inspect(first))['visible']).toBe(true);
    expect((await inspect(second))['id']).not.toBe(initial['id']);
    expect(Reflect.get(window, 'fixtureIdentity')).toBeUndefined();
    first.emit('host-event', 1);
    await first.request('emit', 3);
    expect((await inspect(second))['events']).toBe('[]');
    expect(() => first.mount(secondContainer)).toThrow();
  });

  it('跨来源应用需要明确准入，通过专属端口正常通信', async () => {
    const { container, options } = setup();
    const cross = new URL('/test-app/app.html', inject('fixtureOrigin'));
    const denied = createOrbit();
    expect(() => denied.createApp({ ...options, url: cross.href })).toThrow();
    denied.dispose();
    const runtime = createOrbit({ allowedOrigins: [cross.origin] });
    resources.push(() => runtime.dispose());
    const instance = runtime.createApp({ ...options, url: cross.href });
    await instance.mount(container);
    expect(new URL(String((await inspect(instance))['url'])).origin).toBe(cross.origin);
    expect(await instance.request('echo', { crossOrigin: true })).toEqual({ crossOrigin: true });
  });

  it('请求超时和取消传到子应用，销毁拒绝在途请求', async () => {
    const { runtime, container, options } = setup();
    const app = runtime.createApp(options);
    await app.mount(container);
    const cancelled = vi.fn();
    runtime.bus.$on('cancelled', cancelled);
    await expect(app.request('slow', null, { timeout: 30 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const pending = app.request('slow', null, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    const stopped = app.request('slow');
    app.destroy();
    await expect(stopped).rejects.toMatchObject({ code: 'DESTROYED' });
  });

  it('load 不冒充 ready，启动超时清理并可用相同身份重试', async () => {
    const { runtime, container, options, report } = setup('silent');
    const app = runtime.createApp({ ...options, timeout: 400 });
    await expect(app.mount(container)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(app.snapshot.state).toBe('failed');
    expect(container.children).toHaveLength(0);
    expect(runtime.instances).toEqual([]);
    const next = runtime.createApp({ ...options, url: new URL('/test-app/app.html', location.href).href });
    app.destroy();
    expect(runtime.instances).toHaveLength(1);
    await next.mount(container);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('启动中关闭与取消不会复活实例，卸载容器自动释放', async () => {
    const { runtime, container, options } = setup('silent');
    const app = runtime.createApp(options);
    const pending = app.mount(container);
    app.destroy();
    await expect(pending).rejects.toMatchObject({ code: 'DESTROYED' });
    const controller = new AbortController();
    const next = runtime.createApp({ ...options, signal: controller.signal });
    const aborted = next.mount(container);
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' });
    const third = runtime.createApp({ ...options, url: new URL('/test-app/app.html', location.href).href });
    await third.mount(container);
    container.remove();
    expect(third.snapshot.state).toBe('destroyed');
    expect(runtime.instances).toEqual([]);
  });

  it('子应用主动报告启动失败，状态观察者错误不会阻断清理', async () => {
    const { runtime, container, options, report } = setup('fail');
    const app = runtime.createApp(options);
    app.subscribe(() => {
      throw new Error('观察者错误');
    });
    await expect(app.mount(container)).rejects.toMatchObject({ code: 'APP_ERROR' });
    expect(runtime.instances).toEqual([]);
    expect(report).toHaveBeenCalled();
  });

  it('拒绝错误 source、origin 和令牌的握手及伪造全局 ready', async () => {
    const { runtime, container, options } = setup('silent');
    const app = runtime.createApp({ ...options, timeout: 350 });
    const pending = app.mount(container);
    const frame = container.querySelector('aiao-orbit')!.shadowRoot!.querySelector('iframe')!;
    const channel = new URL(frame.src).searchParams.get(CHANNEL_PARAM);
    for (const event of [
      { source: window, origin: location.origin, data: { protocol: PROTOCOL, type: 'hello', channel } },
      {
        source: frame.contentWindow,
        origin: 'https://evil.example',
        data: { protocol: PROTOCOL, type: 'hello', channel }
      },
      {
        source: frame.contentWindow,
        origin: location.origin,
        data: { protocol: PROTOCOL, type: 'hello', channel: 'wrong' }
      },
      { source: frame.contentWindow, origin: location.origin, data: { type: 'ready' } }
    ])
      window.dispatchEvent(new MessageEvent<unknown>('message', event));
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('反复装载销毁 30 轮不遗留实例和 iframe；binding 支持 StrictMode 重挂', async () => {
    const { runtime, container, options } = setup();
    const binding = createOrbitBinding(runtime, options);
    expect(binding.instance).toBeUndefined();
    for (let index = 0; index < 30; index++) {
      await binding.mount(container);
      expect(binding.instance?.snapshot.state).toBe('ready');
      binding.unmount();
      expect(runtime.instances).toEqual([]);
      expect(container.children).toHaveLength(0);
    }
    binding.unmount();
  }, 30_000);

  it('非法容器与未就绪操作显式失败，取消订阅和预置 props 有效', async () => {
    const { runtime, container, options } = setup();
    const app = runtime.createApp(options);
    expect(() => app.mount(document.createElement('div'))).toThrow();
    expect(() => app.hide()).toThrow();
    expect(() => app.show()).toThrow();
    const observer = vi.fn();
    app.subscribe(observer)();
    app.setProps({ before: 'mount' });
    await app.mount(container);
    expect((await inspect(app))['props']).toEqual({ before: 'mount' });
    expect(observer).not.toHaveBeenCalled();
  });
});

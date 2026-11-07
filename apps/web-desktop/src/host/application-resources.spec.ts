import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationResources } from './application-resources.js';

function fixture(status: Record<string, unknown>) {
  const postMessage = vi.fn((data: Record<string, unknown>, ports: MessagePort[]) => {
    ports[0].postMessage(data['type'] === 'status' ? status : { releases: [] });
  });
  const worker = { postMessage } as unknown as ServiceWorker;
  const controller = new AbortController();
  return {
    resources: new ApplicationResources(() => worker, new URL('https://desktop.test/space/'), controller.signal),
    controller,
    postMessage
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('DESKTOP-US-502 旧 Worker 协议协商', () => {
  it('旧 status 回复立即要求更新，不发送旧 Worker 无法处理的请求', async () => {
    vi.stubEnv('DEV', false);
    const { resources, postMessage } = fixture({ version: 'legacy', complete: true });
    await expect(resources.load()).rejects.toThrow('UPDATE_REQUIRED');
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toEqual({ type: 'status' });
  });
  it('确认协议后读取当前受控目录', async () => {
    vi.stubEnv('DEV', false);
    const { resources, postMessage } = fixture({ version: 'current', protocol: 2, complete: true });
    await expect(resources.load()).resolves.toBeUndefined();
    expect(postMessage.mock.calls.map(([data]) => data['type'])).toEqual(['status', 'releases']);
  });
  it('Worker 无响应时五秒内结束启动等待', async () => {
    vi.stubEnv('DEV', false);
    vi.useFakeTimers();
    const { resources, postMessage } = fixture({});
    postMessage.mockImplementation(() => undefined);
    const rejected = expect(resources.load()).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('Worker 已失效导致发送失败时释放计时器和消息端口', async () => {
    vi.stubEnv('DEV', false);
    vi.useFakeTimers();
    const { resources, postMessage } = fixture({});
    postMessage.mockImplementationOnce(() => {
      throw new Error('InvalidStateError');
    });
    await expect(resources.load()).rejects.toThrow('InvalidStateError');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('宿主销毁立即取消协议等待，不残留超时任务', async () => {
    vi.stubEnv('DEV', false);
    vi.useFakeTimers();
    const { resources, postMessage, controller } = fixture({});
    postMessage.mockImplementationOnce(() => undefined);
    const pending = resources.load();
    controller.abort();
    await expect(pending).rejects.toThrow('CANCELLED');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('DESKTOP-US-307 资源请求与引用释放', () => {
  const pin = { appId: 'editor', version: '1.0.0', key: 'a'.repeat(64) };

  it('后台请求携带唯一身份和优先级，独立取消只释放自己的引用', async () => {
    const { resources, postMessage } = fixture({});
    postMessage.mockImplementation(() => undefined);
    const controller = new AbortController();
    const pending = resources.prepare(pin, { priority: 'background', signal: controller.signal });
    const data = postMessage.mock.calls[0][0];
    expect(data).toEqual({ type: 'prepare-release', ...pin, id: expect.any(String), priority: 'background' });
    expect(resources.references()).toEqual([{ id: expect.any(String), key: pin.key }]);
    const rejected = expect(pending).rejects.toThrow('CANCELLED');
    controller.abort();
    await rejected;
    expect(postMessage.mock.calls[1][0]).toEqual({ type: 'cancel-release', id: data['id'] });
    expect(resources.references()).toEqual([]);
  });

  it('超时取消通知发送失败时仍然结束请求并释放持有引用', async () => {
    vi.useFakeTimers();
    const { resources, postMessage } = fixture({});
    postMessage.mockImplementation(data => {
      if (data['type'] === 'cancel-release') throw new Error('InvalidStateError');
    });
    const pending = resources.prepare(pin);
    const rejected = expect(pending).rejects.toThrow('InvalidStateError');
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    expect(resources.references()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])('准备结果为 %s 时释放内部引用，保留独立持有引用', async complete => {
    const { resources, postMessage } = fixture({});
    postMessage.mockImplementation((_data, ports) => ports[0].postMessage({ complete, error: '下载失败' }));
    const release = resources.hold(pin);
    const pending = resources.prepare(pin);
    expect(resources.references()).toHaveLength(2);
    if (complete) await expect(pending).resolves.toBeUndefined();
    else await expect(pending).rejects.toThrow('下载失败');
    expect(resources.references()).toHaveLength(1);
    release();
    release();
    expect(resources.references()).toEqual([]);
  });
});

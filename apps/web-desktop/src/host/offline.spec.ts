import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateWorker, waitForActivation } from './offline.js';

class InstallingWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  transition(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

afterEach(() => vi.useRealTimers());
describe('DESKTOP-US-502 离线安装失败不能永久等待', () => {
  it('完成激活才就绪，安装失败立即报错', async () => {
    const ready = new InstallingWorker();
    const failed = new InstallingWorker();
    const pending = waitForActivation(ready);
    ready.transition('installed');
    ready.transition('activated');
    await expect(pending).resolves.toBeUndefined();
    const failure = waitForActivation(failed);
    failed.transition('redundant');
    await expect(failure).rejects.toThrow('OFFLINE');
  });
  it('超时或宿主销毁都会结束等待并清理监听', async () => {
    vi.useFakeTimers();
    const timed = waitForActivation(new InstallingWorker());
    const rejected = expect(timed).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(30000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    const controller = new AbortController();
    const pending = waitForActivation(new InstallingWorker(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('CANCELLED');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('DESKTOP-US-502 明确激活新外壳', () => {
  it('发送激活消息前监听控制器切换，立即响应也不能漏掉', async () => {
    const workers = new EventTarget();
    const postMessage = vi.fn(() => workers.dispatchEvent(new Event('controllerchange')));
    const worker = { postMessage } as unknown as ServiceWorker;
    await expect(activateWorker(worker, workers)).resolves.toBeUndefined();
    expect(postMessage).toHaveBeenCalledWith({ type: 'activate-confirmed' });
  });
  it('切换无响应或宿主销毁时结束等待并移除监听', async () => {
    vi.useFakeTimers();
    const workers = new EventTarget();
    const remove = vi.spyOn(workers, 'removeEventListener');
    const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const timed = expect(activateWorker(worker, workers)).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(15000);
    await timed;
    const controller = new AbortController();
    const cancelled = activateWorker(worker, workers, controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toThrow('CANCELLED');
    expect(remove).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('已取消的页面不发送激活消息', async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;
    await expect(activateWorker(worker, new EventTarget(), controller.signal)).rejects.toThrow('CANCELLED');
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
});

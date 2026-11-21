import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareOfflineShell } from './offline-shell.js';

type WorkerState = 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';
type Reply = 'ok' | 'fail' | 'silent';
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** 能收发 statechange 的假 Service Worker；按 reply 通过随消息转移的端口应答 cache-shell。 */
function fakeWorker(state: WorkerState = 'activated', reply: Reply = 'ok') {
  const worker = Object.assign(new EventTarget(), {
    state,
    postMessage: vi.fn((_message: unknown, ports: MessagePort[]) => {
      if (reply !== 'silent') ports[0].postMessage({ ok: reply === 'ok' });
    })
  });
  const become = (next: WorkerState) => {
    worker.state = next;
    worker.dispatchEvent(new Event('statechange'));
  };
  return { worker, become };
}

interface Slots {
  active?: ReturnType<typeof fakeWorker>['worker'];
  installing?: ReturnType<typeof fakeWorker>['worker'];
  waiting?: ReturnType<typeof fakeWorker>['worker'];
}

/** `ready` 永不 resolve：它按页面创建时的 URL 匹配 scope，从其他路由经 SPA 导航进入协作页时就是这样。 */
function stubBrowser(slots: Slots, online = true) {
  const register = vi.fn().mockResolvedValue({ active: null, installing: null, waiting: null, ...slots });
  vi.stubGlobal('navigator', { onLine: online, serviceWorker: { register, ready: new Promise(() => undefined) } });
  vi.stubGlobal('performance', { getEntriesByType: () => [{ name: 'https://app.example/assets/app.js' }] });
  return register;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('离线页面外壳的准备', () => {
  it('只在 /collaboration 范围内注册 Service Worker，并把已加载的资源清单交给它缓存', async () => {
    const { worker } = fakeWorker();
    const register = stubBrowser({ active: worker });
    await prepareOfflineShell();
    expect(register).toHaveBeenCalledWith('/collaboration-sw.js', { scope: '/collaboration' });
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'cache-shell', urls: ['https://app.example/assets/app.js'] },
      [expect.anything()]
    );
  });

  it('不依赖 navigator.serviceWorker.ready，否则经 SPA 路由进入协作页时会一直等待', async () => {
    stubBrowser({ active: fakeWorker().worker });
    await expect(prepareOfflineShell()).resolves.toBeUndefined();
  }, 1000);

  it('等安装中的 Service Worker 激活后才发送缓存请求', async () => {
    const { worker, become } = fakeWorker('installing');
    stubBrowser({ installing: worker });
    const prepared = prepareOfflineShell();
    await flush();
    become('installed');
    become('activating');
    await flush();
    expect(worker.postMessage).not.toHaveBeenCalled();
    become('activated');
    await expect(prepared).resolves.toBeUndefined();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  }, 1000);

  it('等待中的 Service Worker 同样等到激活；安装失败（redundant）时明确报错而不是一直等待', async () => {
    const waiting = fakeWorker('installed');
    stubBrowser({ waiting: waiting.worker });
    const activated = prepareOfflineShell();
    await flush();
    waiting.become('activated');
    await expect(activated).resolves.toBeUndefined();
    const broken = fakeWorker('installing');
    stubBrowser({ installing: broken.worker });
    const failed = prepareOfflineShell();
    await flush();
    broken.become('redundant');
    await expect(failed).rejects.toThrow('离线页面缓存尚未激活');
    expect(broken.worker.postMessage).not.toHaveBeenCalled();
  }, 1000);

  it('注册后没有任何可用的 Service Worker 时报错', async () => {
    stubBrowser({});
    await expect(prepareOfflineShell()).rejects.toThrow('离线页面缓存尚未激活');
  });

  it('Service Worker 应答失败时报错', async () => {
    stubBrowser({ active: fakeWorker('activated', 'fail').worker });
    await expect(prepareOfflineShell()).rejects.toThrow('离线页面缓存失败');
  });

  it('Service Worker 30 秒内不应答时超时报错', async () => {
    vi.useFakeTimers();
    stubBrowser({ active: fakeWorker('activated', 'silent').worker });
    const outcome = prepareOfflineShell().catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(30000);
    await expect(outcome).resolves.toBe('离线页面缓存超时');
  });

  it('离线或浏览器不支持 Service Worker 时不注册也不报错', async () => {
    const register = stubBrowser({}, false);
    await expect(prepareOfflineShell()).resolves.toBeUndefined();
    vi.stubGlobal('navigator', { onLine: true });
    await expect(prepareOfflineShell()).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * worker 入口的信任边界测试：入口模块在 import 时把 onmessage 挂到 `self` 上，
 * 用可替换的全局替身（fake self / navigator）驱动它 —— 分派语义由 protocol spec
 * 覆盖，这里只守「来源不符的消息进不了分派」这一条线。
 *
 * `vi.resetModules` 让每条用例拿到重新求值的入口模块：self / navigator 替身是
 * 每个用例自己的，入口顶层代码会重新挂一次 onmessage。
 */

const workerProtocol = vi.hoisted(() => ({
  handleWorkerOp: vi.fn()
}));
vi.mock('./opfs-worker-protocol', () => workerProtocol);

const APP_ORIGIN = 'https://app.example';

interface FakeWorkerSelf {
  onmessage: ((event: MessageEvent) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
  location: { readonly origin: string };
}

/** 挂上 self / navigator 替身后加载入口模块，返回替身供用例驱动与断言。 */
const loadWorker = async (): Promise<{ self: FakeWorkerSelf; getDirectory: ReturnType<typeof vi.fn> }> => {
  const fakeSelf: FakeWorkerSelf = {
    onmessage: null,
    postMessage: vi.fn(),
    location: { origin: APP_ORIGIN }
  };
  const getDirectory = vi.fn().mockResolvedValue({});
  vi.stubGlobal('self', fakeSelf);
  vi.stubGlobal('navigator', { storage: { getDirectory } });
  await import('./opfs-storage.worker');
  return { self: fakeSelf, getDirectory };
};

/** 以指定来源投递一条消息；onmessage 未安装时直接让用例失败而不是空转。 */
const dispatch = async (fakeSelf: FakeWorkerSelf, origin: string, data: unknown): Promise<void> => {
  const handler = fakeSelf.onmessage;
  expect(handler, 'worker 入口应安装 onmessage').not.toBeNull();
  await (handler as NonNullable<FakeWorkerSelf['onmessage']>)({ origin, data } as MessageEvent);
};

beforeEach(() => {
  vi.resetModules();
  workerProtocol.handleWorkerOp.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opfs-storage.worker 入口的信任边界', () => {
  it('同源消息照常分派，响应原样回传', async () => {
    const { self } = await loadWorker();
    workerProtocol.handleWorkerOp.mockResolvedValue({ id: 7, ok: true });

    await dispatch(self, APP_ORIGIN, { id: 7, kind: 'close', handleId: 3 });

    expect(workerProtocol.handleWorkerOp).toHaveBeenCalledTimes(1);
    expect(self.postMessage).toHaveBeenCalledWith({ id: 7, ok: true });
  });

  it('异源消息被丢弃：不分派、不碰 OPFS 根、不回传', async () => {
    const { self, getDirectory } = await loadWorker();

    await dispatch(self, 'https://evil.example', { id: 0, kind: 'open', segments: ['a.txt'] });

    expect(workerProtocol.handleWorkerOp).not.toHaveBeenCalled();
    expect(getDirectory).not.toHaveBeenCalled();
    expect(self.postMessage).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OpfsDirectoryHandleLike,
  OpfsFileHandleLike,
  OpfsSyncHandleLike,
  OpfsWorkerResponse
} from './opfs-worker-protocol';

/**
 * storage 写通道 worker 入口的行为测试：信任边界 + 请求结算。
 *
 * 入口文件薄到只剩「校验消息来源、解析 OPFS 根、结算每一条请求」。这里守两条线：
 *
 * 1. **信任边界**——来源不符的消息进不了分派：静默丢弃而不是回错误响应，
 *    不给不信任的发送方当探针。
 * 2. **请求结算**——async onmessage 的拒绝只会变成 unhandledrejection（不触发 Worker
 *    的 error 事件，页面侧 port.onError 收不到），所以根解析失败也必须以**同 id** 的
 *    失败响应回到消息通道；且失败的根解析**不缓存**——缓存住一个 rejected promise
 *    会让 OPFS 恢复后的写通道再也不自愈。
 *
 * 分派语义本身由 protocol spec 覆盖；这里同源用例只验证「消息确实进了分派并原样回传」。
 * 模块在 import 时把 handler 挂上 `self.onmessage`，因此每个用例都在 `resetModules`
 * 之后动态 import，拿到全新的 handler 与句柄表。
 */

const APP_ORIGIN = 'https://app.example';

interface FakeWorkerSelf {
  onmessage: ((event: MessageEvent) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
  location: { readonly origin: string };
}

/** 最小可用 OPFS 树：只满足 open 请求走通，不关心真实文件语义。 */
const emptySyncHandle: OpfsSyncHandleLike = {
  write: () => undefined,
  flush: () => undefined,
  close: () => undefined,
  truncate: () => undefined
};
const emptyFileHandle: OpfsFileHandleLike = {
  createSyncAccessHandle: () => Promise.resolve(emptySyncHandle)
};
const emptyRoot = {
  getDirectoryHandle: () => Promise.resolve(emptyRoot as OpfsDirectoryHandleLike),
  getFileHandle: () => Promise.resolve(emptyFileHandle)
} as OpfsDirectoryHandleLike;

/** 挂上 self / navigator 替身后加载入口模块，返回替身供用例驱动与断言。 */
const loadWorker = async (getDirectory: ReturnType<typeof vi.fn>): Promise<FakeWorkerSelf> => {
  const fakeSelf: FakeWorkerSelf = {
    onmessage: null,
    postMessage: vi.fn(),
    location: { origin: APP_ORIGIN }
  };
  vi.stubGlobal('self', fakeSelf);
  vi.stubGlobal('navigator', { storage: { getDirectory } });
  await import('./opfs-storage.worker');
  return fakeSelf;
};

/** 以指定来源投递一条消息；onmessage 未安装时直接让用例失败而不是空转。 */
const dispatch = async (fakeSelf: FakeWorkerSelf, origin: string, data: unknown): Promise<void> => {
  const handler = fakeSelf.onmessage;
  expect(handler, 'worker 入口应安装 onmessage').not.toBeNull();
  await (handler as NonNullable<FakeWorkerSelf['onmessage']>)({ origin, data } as MessageEvent);
};

/** 取最近一条回传的响应；没有回传时让用例在断言处失败。 */
const lastResponse = (self: FakeWorkerSelf): OpfsWorkerResponse => {
  const posted = self.postMessage.mock.calls.at(-1)?.[0] as OpfsWorkerResponse | undefined;
  expect(posted, 'worker 应回传过响应').toBeDefined();
  return posted as OpfsWorkerResponse;
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opfs-storage.worker 入口', () => {
  describe('信任边界', () => {
    it('同源消息照常分派，响应原样回传', async () => {
      const getDirectory = vi.fn().mockResolvedValue(emptyRoot);
      const self = await loadWorker(getDirectory);

      await dispatch(self, APP_ORIGIN, { id: 7, kind: 'open', segments: ['a.txt'] });

      expect(self.postMessage).toHaveBeenCalledTimes(1);
      expect(lastResponse(self)).toMatchObject({ id: 7, ok: true });
    });

    it('异源消息被丢弃：不分派、不碰 OPFS 根、不回传', async () => {
      const getDirectory = vi.fn().mockResolvedValue(emptyRoot);
      const self = await loadWorker(getDirectory);

      await dispatch(self, 'https://evil.example', { id: 0, kind: 'open', segments: ['a.txt'] });

      expect(getDirectory).not.toHaveBeenCalled();
      expect(self.postMessage).not.toHaveBeenCalled();
    });

    it('WebKit 的空串 origin 按同源放行：WKWebView 不填 worker 消息的 origin', async () => {
      const getDirectory = vi.fn().mockResolvedValue(emptyRoot);
      const self = await loadWorker(getDirectory);

      await dispatch(self, '', { id: 7, kind: 'open', segments: ['a.txt'] });

      expect(getDirectory).toHaveBeenCalledTimes(1);
      expect(lastResponse(self)).toMatchObject({ id: 7, ok: true });
    });
  });

  describe('请求结算', () => {
    it('getDirectory 失败也结算请求：回失败响应而不是让页面侧永远等', async () => {
      const getDirectory = vi.fn().mockRejectedValue(new DOMException('storage disabled', 'SecurityError'));
      const self = await loadWorker(getDirectory);

      await dispatch(self, APP_ORIGIN, { id: 7, kind: 'open', segments: ['a.txt'] });

      const response = lastResponse(self);
      expect(response.id).toBe(7);
      expect(response.ok).toBe(false);
      expect(response.error).toEqual({ name: 'SecurityError', message: 'storage disabled' });
    });

    it('失败的根解析不缓存：OPFS 恢复后下一次请求可以成功', async () => {
      const getDirectory = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('storage disabled', 'SecurityError'))
        .mockResolvedValue(emptyRoot);
      const self = await loadWorker(getDirectory);

      await dispatch(self, APP_ORIGIN, { id: 1, kind: 'open', segments: ['a.txt'] });
      expect(lastResponse(self).ok).toBe(false);

      await dispatch(self, APP_ORIGIN, { id: 2, kind: 'open', segments: ['a.txt'] });

      expect(getDirectory).toHaveBeenCalledTimes(2);
      expect(lastResponse(self)).toMatchObject({ id: 2, ok: true });
    });

    it('root 不可用期间每一条请求都被结算，没有一条挂死', async () => {
      const getDirectory = vi.fn().mockRejectedValue(new DOMException('storage disabled', 'SecurityError'));
      const self = await loadWorker(getDirectory);

      await dispatch(self, APP_ORIGIN, { id: 1, kind: 'open', segments: ['a.txt'] });
      const first = lastResponse(self);
      await dispatch(self, APP_ORIGIN, { id: 2, kind: 'open', segments: ['b.txt'] });
      const second = lastResponse(self);

      expect(first).toMatchObject({ id: 1, ok: false });
      expect(second).toMatchObject({ id: 2, ok: false });
    });
  });
});

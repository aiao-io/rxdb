import { isNetworkError, NetworkOfflineError } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpDisconnectedError, HttpInvalidResponseError, HttpResponseError } from './errors.js';
import { HttpTransport } from './transport.js';

/**
 * US-212 AC#12 / #13 / #16 / #34：**transport 归适配器所有**。
 *
 * 这一层是四条契约的唯一实现点：auth hook 在请求前调用、非 2xx 带数字 `status`、
 * 传输失败原样进 `NetworkOfflineError`、单请求超时与主动断开产生**可区分**的错误。
 * handler 拿不到 `Response`，所以这些断言只能落在这里。
 */
describe('HttpTransport', () => {
  const BASE = 'https://api.example.com/v1';
  let fetchMock: ReturnType<typeof vi.fn>;

  /** 用 `vi.stubGlobal` 打桩而不是给 transport 开注入点：故事明写阶段 A 不留 transport 覆盖点 */
  const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>): void => {
    fetchMock = vi.fn(impl);
    vi.stubGlobal('fetch', fetchMock);
  };

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const createTransport = (
    overrides: Partial<ConstructorParameters<typeof HttpTransport>[0]> = {}
  ): { transport: HttpTransport; controller: AbortController } => {
    const controller = new AbortController();
    const transport = new HttpTransport({
      baseUrl: BASE,
      requestTimeoutMs: 30000,
      disconnectSignal: controller.signal,
      ...overrides
    });
    return { transport, controller };
  };

  beforeEach(() => stubFetch(() => Promise.resolve(jsonResponse({ ok: true }))));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('URL 拼接', () => {
    it.each([
      ['https://api.example.com/v1', 'items'],
      ['https://api.example.com/v1/', 'items'],
      ['https://api.example.com/v1', '/items'],
      ['https://api.example.com/v1/', '/items']
    ])('baseUrl=%s + url=%s 都拼成 /v1/items', async (baseUrl, url) => {
      // 用 new URL(path, base) 会在没有尾斜杠时吃掉 /v1，接入方要靠记忆避坑
      const { transport } = createTransport({ baseUrl });
      await transport.sendJson({ url, method: 'GET' }, 'test');
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/items');
    });

    it('绝对 URL 原样透传，忽略 baseUrl', async () => {
      const { transport } = createTransport();
      await transport.sendJson({ url: 'https://other.example.com/x', method: 'GET' }, 'test');
      expect(fetchMock.mock.calls[0][0]).toBe('https://other.example.com/x');
    });
  });

  describe('请求构造', () => {
    it('body 由适配器 JSON 序列化并补 content-type', async () => {
      const { transport } = createTransport();
      await transport.sendJson({ url: 'items', method: 'POST', body: { a: 1 } }, 'test');
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.body).toBe('{"a":1}');
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    });

    it('无 body 时不带 body，也不补 content-type', async () => {
      const { transport } = createTransport();
      await transport.sendJson({ url: 'items', method: 'GET' }, 'test');
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.body).toBeUndefined();
      expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
    });

    it('header 优先级：适配器默认 < spec < auth hook', async () => {
      const { transport } = createTransport({
        headers: { 'x-tag': 'default', 'x-keep': 'kept' },
        auth: () => ({ 'x-tag': 'auth' })
      });
      await transport.sendJson({ url: 'items', method: 'GET', headers: { 'x-tag': 'spec' } }, 'test');
      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['x-tag']).toBe('auth');
      expect(headers['x-keep']).toBe('kept');
    });
  });

  describe('auth hook（AC#16）', () => {
    it('每次请求前调用，异步 hook 也等它 resolve', async () => {
      const auth = vi.fn(() => Promise.resolve({ authorization: 'Bearer t' }));
      const { transport } = createTransport({ auth });
      await transport.sendJson({ url: 'items', method: 'GET' }, 'test');
      await transport.sendJson({ url: 'items', method: 'GET' }, 'test');
      expect(auth).toHaveBeenCalledTimes(2);
      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer t');
    });

    it('hook 抛错则请求不发出，错误原样抛出不被包装', async () => {
      // 包成 NetworkOfflineError 会让 token 过期被 offlineFallback 吞成缓存命中
      const failure = new Error('token refresh failed');
      const { transport } = createTransport({
        auth: () => {
          throw failure;
        }
      });
      await expect(transport.sendJson({ url: 'items', method: 'GET' }, 'test')).rejects.toBe(failure);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('响应分类', () => {
    it.each([401, 404, 409, 422, 500])('%d 抛 HttpResponseError，带数字 status 且判非网络错误', async status => {
      stubFetch(() => Promise.resolve(new Response('nope', { status })));
      const { transport } = createTransport();
      const error = await transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpResponseError);
      expect((error as HttpResponseError).status).toBe(status);
      // 第 2 条判据：拿到状态码 = 连接是通的，不该降级到缓存
      expect(isNetworkError(error)).toBe(false);
    });

    it('传输失败抛 core 的 NetworkOfflineError 并保留原错误', async () => {
      // node/undici 的失败消息是 `fetch failed`，一条都不命中 FETCH_FAILURE_MESSAGE 正则，
      // 所以必须由本包显式转换，不能指望 isNetworkError 自己认出来
      const cause = new TypeError('fetch failed');
      stubFetch(() => Promise.reject(cause));
      const { transport } = createTransport();
      const error = await transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NetworkOfflineError);
      expect((error as NetworkOfflineError).originalError).toBe(cause);
      expect(isNetworkError(error)).toBe(true);
    });

    it('2xx 但响应体不是 JSON 抛 HttpInvalidResponseError，判非网络错误', async () => {
      // 代理返回 200 + HTML 错误页是真实存在的形态，裸 SyntaxError 无法定位
      stubFetch(() => Promise.resolve(new Response('<html>oops</html>', { status: 200 })));
      const { transport } = createTransport();
      const error = await transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpInvalidResponseError);
      expect((error as HttpInvalidResponseError).status).toBe(200);
      expect(isNetworkError(error)).toBe(false);
    });

    it('sendJson 返回已解码的响应体', async () => {
      stubFetch(() => Promise.resolve(jsonResponse([{ id: 'a' }])));
      const { transport } = createTransport();
      await expect(transport.sendJson({ url: 'items', method: 'GET' }, 'test')).resolves.toEqual([{ id: 'a' }]);
    });
  });

  describe('超时与断开必须可区分（AC#34）', () => {
    /**
     * 永不 resolve、只在 abort 时 reject —— 复刻真实 fetch 对 signal 的反应。
     *
     * @remarks
     * 传入时**已经** abort 的 signal 必须立刻 reject：真实 fetch 就是这么做的，
     * 而只挂 `addEventListener('abort')` 的桩会永远等一个不会再来的事件，
     * 把「断开窗口落在 auth hook 的 await 里」这条真实缺陷伪装成测试超时。
     */
    const stubHanging = (): void => {
      const abortError = (): DOMException => new DOMException('aborted', 'AbortError');
      stubFetch(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            if (init.signal?.aborted) {
              reject(abortError());
              return;
            }
            init.signal?.addEventListener('abort', () => reject(abortError()));
          })
      );
    };

    it('超时抛 NetworkOfflineError，可降级', async () => {
      vi.useFakeTimers();
      stubHanging();
      const { transport } = createTransport({ requestTimeoutMs: 1000 });
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1001);
      const error = await pending;
      expect(error).toBeInstanceOf(NetworkOfflineError);
      // 裸 AbortError 会被 isNetworkError 判 false（NETWORK_ERROR_NAMES 特意排除了它），
      // 于是超时静默变成不可降级的硬失败
      expect(isNetworkError(error)).toBe(true);
      expect((error as NetworkOfflineError).message).toMatch(/1000/);
    });

    it('超时会真的 abort 掉底层请求，不只是让 Promise 先返回', async () => {
      vi.useFakeTimers();
      stubHanging();
      const { transport } = createTransport({ requestTimeoutMs: 1000 });
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1001);
      await pending;
      expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    });

    it('disconnect() 取消抛 HttpDisconnectedError，判非网络错误 —— 不得降级', async () => {
      stubHanging();
      const { transport, controller } = createTransport();
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'fetchMetadata').catch((e: unknown) => e);
      controller.abort();
      const error = await pending;
      expect(error).toBeInstanceOf(HttpDisconnectedError);
      expect((error as HttpDisconnectedError).operation).toBe('fetchMetadata');
      expect(isNetworkError(error)).toBe(false);
    });

    it('已断开后再发请求立即抛错，fetch 不被调用', async () => {
      const { transport, controller } = createTransport();
      controller.abort();
      await expect(transport.sendJson({ url: 'items', method: 'GET' }, 'findByIds')).rejects.toBeInstanceOf(
        HttpDisconnectedError
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('未超时的请求不会留下悬挂定时器', async () => {
      vi.useFakeTimers();
      const { transport } = createTransport({ requestTimeoutMs: 1000 });
      await transport.sendJson({ url: 'items', method: 'GET' }, 'test');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('execute 不判 status（isTableExisted 探测要用）', () => {
    it('404 不抛错，原样返回 Response', async () => {
      stubFetch(() => Promise.resolve(new Response('', { status: 404 })));
      const { transport } = createTransport();
      const response = await transport.execute({ url: 'items', method: 'HEAD' }, 'isTableExisted');
      expect(response.status).toBe(404);
    });

    it('传输失败照样转成 NetworkOfflineError', async () => {
      stubFetch(() => Promise.reject(new TypeError('fetch failed')));
      const { transport } = createTransport();
      await expect(transport.execute({ url: 'items', method: 'GET' }, 'isTableExisted')).rejects.toBeInstanceOf(
        NetworkOfflineError
      );
    });
  });
});

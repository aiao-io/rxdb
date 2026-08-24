import { isNetworkError, NetworkOfflineError } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpDisconnectedError,
  HttpInvalidResponseError,
  HttpRequestBuildError,
  HttpResponseError
} from './errors.js';
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

  /** 连接在读 body 之前就断了：`cancel()` 会 reject，而状态码已经拿到了 */
  const responseWithFailingCancel = (status: number): Response => {
    const response = new Response('{}', { status });
    Object.defineProperty(response, 'body', {
      value: { cancel: () => Promise.reject(new Error('socket gone')) }
    });
    return response;
  };

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

  describe('超时窗口必须罩住响应体读取（AC#34）', () => {
    /**
     * header 已到、body 迟迟不来 —— `fetch` 早已 resolve，此时**只剩** body 这一段还需要保护。
     *
     * @remarks
     * 与 {@link stubHanging} 互补：那个桩里 fetch 永不 resolve，所以只要定时器在 `fetch`
     * 之后才清理，测试就是绿的。真实的 slow-loris 恰恰相反 —— 状态行秒回、body 挂死。
     */
    const stubStallingBody = (status = 200): void => {
      stubFetch((_url, init) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start: controller => {
                init.signal?.addEventListener('abort', () =>
                  controller.error(new DOMException('aborted', 'AbortError'))
                );
              }
            }),
            { status }
          )
        )
      );
    };

    it('header 已回、body 不回包 —— 仍在 requestTimeoutMs 内抛 NetworkOfflineError', async () => {
      vi.useFakeTimers();
      stubStallingBody();
      const { transport } = createTransport({ requestTimeoutMs: 1000 });
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'fetchMetadata').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1001);
      // 定时器若在 fetch resolve 时就清掉，这个 Promise 永不 settle：
      // AC#34 要消灭的挂起只是从 header 段挪到了 body 段，上游 forkJoin 照样卡死
      const error = await pending;
      expect(error).toBeInstanceOf(NetworkOfflineError);
      expect(isNetworkError(error)).toBe(true);
    });

    it('body 读取期超时会真的 abort 底层流', async () => {
      vi.useFakeTimers();
      stubStallingBody();
      const { transport } = createTransport({ requestTimeoutMs: 1000 });
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1001);
      await pending;
      expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    });

    it('disconnect() 落在 body 读取期间 —— 抛 HttpDisconnectedError，不是裸 AbortError', async () => {
      stubStallingBody();
      const { transport, controller } = createTransport();
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'fetchMetadata').catch((e: unknown) => e);
      await new Promise(resolve => setTimeout(resolve, 0));
      controller.abort();
      const error = await pending;
      // 裸 AbortError 绕过 classify() 后 isNetworkError 判 false，
      // 「断开一律 HttpDisconnectedError」的契约在 body 段失守
      expect(error).toBeInstanceOf(HttpDisconnectedError);
      expect((error as HttpDisconnectedError).operation).toBe('fetchMetadata');
      expect(isNetworkError(error)).toBe(false);
    });

    it('拿到状态码的响应即使 body 读不完，仍按状态码分类，不降级成离线', async () => {
      vi.useFakeTimers();
      stubStallingBody(409);
      const { transport } = createTransport({ requestTimeoutMs: 1000 });
      const pending = transport.sendJson({ url: 'items', method: 'GET' }, 'test').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1001);
      const error = await pending;
      // 409 是远端给出的回答，连接是通的；判成离线会让 offlineFallback 把冲突静默换成陈旧缓存
      expect(error).toBeInstanceOf(HttpResponseError);
      expect((error as HttpResponseError).status).toBe(409);
      expect(isNetworkError(error)).toBe(false);
    });
  });

  describe('请求构造失败不得伪装成离线', () => {
    /** `JSON.stringify` 遇 bigint 抛 TypeError —— 与 `fetch` 传输失败抛的是同一个类型 */
    const UNSERIALIZABLE = { nested: { amount: 7n } };

    it('body 不可序列化 → HttpRequestBuildError，isNetworkError 判 false', async () => {
      const { transport } = createTransport();
      const error = await transport
        .sendJson({ url: 'items', method: 'POST', body: UNSERIALIZABLE }, 'create')
        .catch((e: unknown) => e);
      // 包成 NetworkOfflineError 会让「数据脏」以「网络断」的面目出现，排查方向整个偏掉
      expect(error).toBeInstanceOf(HttpRequestBuildError);
      expect(isNetworkError(error)).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('开不开条件请求，同一份脏 body 抛同一种错误', async () => {
      const spec = { url: 'items', method: 'POST' as const, body: UNSERIALIZABLE };
      const { transport: plain } = createTransport();
      const { transport: conditional } = createTransport({ conditional: { maxEntries: 8 } });
      const direct = await plain.sendJson(spec, 'fetchMetadata').catch((e: unknown) => e);
      const cached = await conditional.sendJson(spec, 'fetchMetadata').catch((e: unknown) => e);
      // 指纹计算与真正上线的字节走同一个出口，两条路径不该给出两种错误
      expect(cached).toBeInstanceOf(HttpRequestBuildError);
      expect((cached as Error).constructor).toBe((direct as Error).constructor);
    });

    it('auth hook 返回非法 header 值 → HttpRequestBuildError，不被 offlineFallback 吞', async () => {
      const { transport } = createTransport({ auth: () => ({ authorization: 'Bearer a\r\nx-injected: 1' }) });
      const error = await transport.sendJson({ url: 'items', method: 'GET' }, 'fetchMetadata').catch((e: unknown) => e);
      // 认证/配置 bug 若被兜底成离线，offlineFallback 会静默回退陈旧缓存，真实故障永远浮不出来
      expect(error).toBeInstanceOf(HttpRequestBuildError);
      expect(isNetworkError(error)).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reason 区分 body 与 headers 两种成因', async () => {
      const { transport: badHeaders } = createTransport({ auth: () => ({ 'x bad name': 'v' }) });
      const headerError = await badHeaders
        .sendJson({ url: 'items', method: 'GET' }, 'fetchMetadata')
        .catch((e: unknown) => e);
      expect((headerError as HttpRequestBuildError).reason).toBe('headers');

      const { transport: plain } = createTransport();
      const bodyError = await plain
        .sendJson({ url: 'items', method: 'POST', body: UNSERIALIZABLE }, 'create')
        .catch((e: unknown) => e);
      expect((bodyError as HttpRequestBuildError).reason).toBe('body');
      expect((bodyError as HttpRequestBuildError).operation).toBe('create');
    });
  });

  describe('execute 不判 status（isTableExisted 探测要用）', () => {
    it('404 不抛错，状态码原样交给 consume', async () => {
      stubFetch(() => Promise.resolve(new Response('', { status: 404 })));
      const { transport } = createTransport();
      const status = await transport.execute({ url: 'items', method: 'HEAD' }, 'isTableExisted', response =>
        Promise.resolve(response.status)
      );
      expect(status).toBe(404);
    });

    it('传输失败照样转成 NetworkOfflineError', async () => {
      stubFetch(() => Promise.reject(new TypeError('fetch failed')));
      const { transport } = createTransport();
      await expect(
        transport.execute({ url: 'items', method: 'GET' }, 'isTableExisted', response => Promise.resolve(response))
      ).rejects.toBeInstanceOf(NetworkOfflineError);
    });

    it('consume 抛的业务错误原样透出，不被 classify 改写成离线', async () => {
      stubFetch(() => Promise.resolve(new Response('', { status: 200 })));
      const { transport } = createTransport();
      const thrown = new HttpResponseError(418, `${BASE}/items`, undefined);
      // consume 在 try 内执行，若不放行 HttpAdapterError，业务错误会被降级成可回退的离线错误
      await expect(
        transport.execute({ url: 'items', method: 'HEAD' }, 'isTableExisted', () => Promise.reject(thrown))
      ).rejects.toBe(thrown);
    });
  });

  describe('sendVoid 不解析响应体，但要把它读完', () => {
    it('2xx 时丢弃响应体 —— 未消费的 body 会占住 undici 连接直到 GC', async () => {
      // 「不解析」不等于「不消费」：delete duck 返回 Observable<void>，body 无处可去，
      // 但 Node 下不读完流就不归还 socket，高频删除会耗尽连接池且全程不报错
      const response = new Response(JSON.stringify({ deleted: 1 }), { status: 200 });
      stubFetch(() => Promise.resolve(response));
      const { transport } = createTransport();
      await transport.sendVoid({ url: 'items', method: 'DELETE' }, 'delete');
      expect(response.bodyUsed).toBe(true);
    });

    it('204 空体不被当成「响应体不是合法 JSON」', async () => {
      stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
      const { transport } = createTransport();
      await expect(transport.sendVoid({ url: 'items', method: 'DELETE' }, 'delete')).resolves.toBeUndefined();
    });

    it('清理响应体失败不把已成功的删除翻成失败', async () => {
      // 2xx 已经给出「删除成功」这个答案了，为一次连接清理动作把它推翻是本末倒置；
      // 这里吞的是 cleanup 的错误，不是操作本身的错误
      stubFetch(() => Promise.resolve(responseWithFailingCancel(200)));
      const { transport } = createTransport();
      await expect(transport.sendVoid({ url: 'items', method: 'DELETE' }, 'delete')).resolves.toBeUndefined();
    });
  });

  /**
   * US-212 AC#28：ETag / If-None-Match 条件请求。
   *
   * 全篇的主张只有一句——**304 必须还原成上次 200 的解析结果，绝不能变成空集**。
   * 空集会被上层读成「远端一条都没有」，整表判成孤儿，正是本包全程在防的假孤儿。
   */
  describe('条件请求（AC#28）', () => {
    const READ_SPEC = { url: 'items', method: 'POST', body: { offset: 0 } } as const;

    const conditionalTransport = (maxEntries = 8) => createTransport({ conditional: { maxEntries } }).transport;

    const ifNoneMatch = (callIndex: number): string | undefined =>
      ((fetchMock.mock.calls[callIndex][1] as RequestInit).headers as Record<string, string>)['if-none-match'];

    /** 首次 200 带 ETag，其后一律 304 */
    const stubEtagThen304 = (body: unknown, etag = '"v1"'): void => {
      let served = false;
      stubFetch(() => {
        if (served) {
          return Promise.resolve(new Response(null, { status: 304 }));
        }
        served = true;
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { etag } }));
      });
    };

    it('首次 200 带 ETag 后，同指纹的下一次请求带 if-none-match', async () => {
      stubEtagThen304({ rows: [1, 2] });
      const transport = conditionalTransport();
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(ifNoneMatch(0)).toBeUndefined();
      expect(ifNoneMatch(1)).toBe('"v1"');
    });

    it('命中 304 时返回上次 200 的解析结果，不是空集', async () => {
      stubEtagThen304({ rows: [1, 2] });
      const transport = conditionalTransport();
      const first = await transport.sendJson(READ_SPEC, 'fetchMetadata');
      const second = await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(second).toEqual(first);
      expect(second).toEqual({ rows: [1, 2] });
    });

    it('调用方改动返回值不会污染缓存 —— 与未启用时的隔离度一致', async () => {
      // 未启用条件请求时每次都是 JSON.parse 的新对象；启用后若把同一个对象反复发出去，
      // 上游任何一次就地改行都会让之后每次 304 都返回被改过的数据，且无处报错
      stubEtagThen304({ rows: [{ id: 'a' }] });
      const transport = conditionalTransport();
      const first = (await transport.sendJson(READ_SPEC, 'fetchMetadata')) as { rows: { id: string }[] };
      first.rows[0].id = 'mutated';
      const second = await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(second).toEqual({ rows: [{ id: 'a' }] });
      expect(second).not.toBe(first);
    });

    it('连续两次 304 各拿一份独立副本', async () => {
      stubEtagThen304({ rows: [{ id: 'a' }] });
      const transport = conditionalTransport();
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      const second = (await transport.sendJson(READ_SPEC, 'fetchMetadata')) as { rows: { id: string }[] };
      second.rows[0].id = 'mutated';
      expect(await transport.sendJson(READ_SPEC, 'fetchMetadata')).toEqual({ rows: [{ id: 'a' }] });
    });

    it('200 携带新 ETag 时用新结果替换缓存', async () => {
      let call = 0;
      stubFetch(() => {
        call += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ v: call }), { status: 200, headers: { etag: `"v${call}"` } })
        );
      });
      const transport = conditionalTransport();
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(await transport.sendJson(READ_SPEC, 'fetchMetadata')).toEqual({ v: 2 });
      expect(ifNoneMatch(1)).toBe('"v1"');
      // 第三次要带的是第二次的 ETag，不是第一次的
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(ifNoneMatch(2)).toBe('"v2"');
    });

    it('响应不带 ETag 时不进缓存，后续请求不带 if-none-match', async () => {
      stubFetch(() => Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 })));
      const transport = conditionalTransport();
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(ifNoneMatch(1)).toBeUndefined();
    });

    it('远端停发 ETag 时丢弃旧条目，不再拿旧 ETag 去校验', async () => {
      let call = 0;
      stubFetch(() => {
        call += 1;
        const headers = call === 1 ? { etag: '"v1"' } : undefined;
        return Promise.resolve(new Response(JSON.stringify({ v: call }), { status: 200, headers }));
      });
      const transport = conditionalTransport();
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      expect(ifNoneMatch(1)).toBe('"v1"');
      expect(ifNoneMatch(2)).toBeUndefined();
    });

    it('未请求条件校验却收到 304 时抛错，绝不当成空集', async () => {
      // 远端行为不合协议。返回 undefined / 空对象会让整表判成孤儿，抛错是唯一诚实行为
      stubFetch(() => Promise.resolve(new Response(null, { status: 304 })));
      const transport = conditionalTransport();
      await expect(transport.sendJson(READ_SPEC, 'fetchMetadata')).rejects.toMatchObject({
        name: 'HttpResponseError',
        status: 304
      });
    });

    it('同指纹的并发请求 single-flight 去重，不出现「后一个拿到 304 而前一个尚未回填」的空洞', async () => {
      stubEtagThen304({ rows: [1, 2] });
      const transport = conditionalTransport();
      const [a, b] = await Promise.all([
        transport.sendJson(READ_SPEC, 'fetchMetadata'),
        transport.sendJson(READ_SPEC, 'fetchMetadata')
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a).toEqual({ rows: [1, 2] });
      expect(b).toEqual({ rows: [1, 2] });
    });

    it('翻页的相邻两页各自校验，不共享条目', async () => {
      stubFetch((_url, init) =>
        Promise.resolve(new Response(String(init.body), { status: 200, headers: { etag: `"${String(init.body)}"` } }))
      );
      const transport = conditionalTransport();
      await transport.sendJson({ url: 'items', method: 'POST', body: { offset: 0 } }, 'fetchMetadata');
      await transport.sendJson({ url: 'items', method: 'POST', body: { offset: 100 } }, 'fetchMetadata');
      // 第 2 页是新指纹，没有可校验的 ETag
      expect(ifNoneMatch(1)).toBeUndefined();
      await transport.sendJson({ url: 'items', method: 'POST', body: { offset: 100 } }, 'fetchMetadata');
      expect(ifNoneMatch(2)).toBe('"{"offset":100}"');
    });

    it('写入口与 version 不参与条件缓存', async () => {
      // 恒 200 带 ETag：若这三个操作参与了缓存，第二次就会带上 if-none-match。
      // 用 stubEtagThen304 反而测不出来——不参与的操作拿到 304 会（正确地）抛错
      stubFetch(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"v1"' } }))
      );
      const transport = conditionalTransport();
      for (const operation of ['create', 'update', 'version']) {
        await transport.sendJson(READ_SPEC, operation);
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(ifNoneMatch(1)).toBeUndefined();
      expect(ifNoneMatch(2)).toBeUndefined();
    });

    it('clearConditionalCache() 后回到无缓存状态', async () => {
      stubEtagThen304({ rows: [1] });
      const transport = conditionalTransport();
      await transport.sendJson(READ_SPEC, 'fetchMetadata');
      transport.clearConditionalCache();
      await transport.sendJson(READ_SPEC, 'fetchMetadata').catch(() => undefined);
      expect(ifNoneMatch(1)).toBeUndefined();
    });

    /**
     * AC#28 明写要有的对照用例：**未启用时行为与阶段 A 逐字相同**。
     */
    describe('未启用时与阶段 A 逐字相同', () => {
      it('不带 if-none-match，且 304 不被解读成缓存命中', async () => {
        stubEtagThen304({ rows: [1] });
        const { transport } = createTransport();
        await transport.sendJson(READ_SPEC, 'fetchMetadata');
        await expect(transport.sendJson(READ_SPEC, 'fetchMetadata')).rejects.toMatchObject({ status: 304 });
        expect(ifNoneMatch(1)).toBeUndefined();
      });

      it('并发同指纹请求不去重，两次调用两次 fetch', async () => {
        stubFetch(() => Promise.resolve(jsonResponse({ rows: [1] })));
        const { transport } = createTransport();
        await Promise.all([
          transport.sendJson(READ_SPEC, 'fetchMetadata'),
          transport.sendJson(READ_SPEC, 'fetchMetadata')
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
    });
  });
});

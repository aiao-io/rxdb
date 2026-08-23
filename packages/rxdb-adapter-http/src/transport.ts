/**
 * @packageDocumentation
 * HTTP transport：**适配器**发请求的唯一实现点（US-212 AC#12、#13、#16、#34）。
 *
 * @remarks
 * handler 只产出 {@link HttpRequestSpec} 与解析响应体，拿不到 `Response`，因此
 * 四条契约只能在这里落地：auth hook 在请求前调用、非 2xx 携带数字 `status`、
 * 传输失败转成 core 的 `NetworkOfflineError`、超时与主动断开产生**可区分**的错误。
 *
 * 阶段 A **不提供** transport 覆盖点（不能换 axios / ky）。留一个可选 `transport`
 * 参数，上面这四句的担保人立刻变成两个，而其中一个不在本包控制之下。
 */

import { NetworkOfflineError } from '@aiao/rxdb';
import { HttpDisconnectedError, HttpInvalidResponseError, HttpResponseError } from './errors.js';
import type { HttpAuthHook, HttpRequestSpec } from './http.interface.js';

/** {@link HttpTransport} 的构造参数。 */
export interface HttpTransportOptions {
  /** 相对 URL 的基地址 */
  baseUrl: string;
  /** 单个请求的超时上限（毫秒），已由 `resolveHttpConfig` 校验为 finite 正整数 */
  requestTimeoutMs: number;
  /** 适配器持有的断开信号，`disconnect()` 时 abort */
  disconnectSignal: AbortSignal;
  auth?: HttpAuthHook;
  /** 附加到所有请求的 header */
  headers?: Record<string, string>;
}

/**
 * 拼接请求 URL。
 *
 * @remarks
 * 不用 `new URL(path, base)`：`new URL('items', 'https://x/v1')` 得到 `https://x/items`，
 * 悄悄吃掉 `/v1`，只有 base 带尾斜杠才符合直觉。这里显式按段拼，四种斜杠组合同一结果。
 */
const joinUrl = (baseUrl: string, url: string): string => {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
};

/** 取错误的可读消息，非 Error 值也要有输出 */
const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 非 2xx 即抛，错误里带**数字** `status`。
 *
 * @remarks
 * 那个数字是 `isNetworkError` 第 2 条判据的命中点：拿到状态码说明连接是通的，
 * 于是 401 / 409 / 422 自动不会被 `offlineFallback` 吞成缓存命中。
 */
const assertOk = async (response: Response, url: string): Promise<void> => {
  if (response.ok) {
    return;
  }
  throw new HttpResponseError(response.status, url, await response.text().catch(() => undefined));
};

/**
 * 执行 handler 产出的请求描述。
 *
 * @remarks
 * 一次请求一个 `AbortController`：它同时接超时定时器与适配器的断开信号，
 * 但**记录是谁先触发的**——两者都表现为 `AbortError`，而语义相反。
 * 超时可降级（远端暂时够不着），断开不可降级（是调用方自己叫停的）。
 */
export class HttpTransport {
  constructor(private readonly options: HttpTransportOptions) {}

  /**
   * 发请求并解码 JSON 响应体，非 2xx 抛错。
   *
   * @param spec - handler 产出的请求描述
   * @param operation - 出错时写进错误的操作名，如 `fetchMetadata`
   * @returns 已 JSON 解码的响应体
   * @throws HttpResponseError 响应状态非 2xx（带数字 `status`）
   * @throws HttpInvalidResponseError 状态 2xx 但响应体不是合法 JSON
   * @throws NetworkOfflineError 传输失败或单请求超时
   * @throws HttpDisconnectedError 请求被 `disconnect()` 取消
   */
  async sendJson(spec: HttpRequestSpec, operation: string): Promise<unknown> {
    const response = await this.execute(spec, operation);
    const url = joinUrl(this.options.baseUrl, spec.url);
    await assertOk(response, url);
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new HttpInvalidResponseError(response.status, url, describeError(error));
    }
  }

  /**
   * 发请求、只判状态码，**不碰响应体**。
   *
   * @remarks
   * 给 `delete` duck 用：core 的 duck 签名返回 `Observable<void>`，没有可解析的东西，
   * 而 `204 No Content` 的空体喂给 {@link sendJson} 会当场变成「响应体不是合法 JSON」——
   * 一次成功的删除被报成协议错误。
   *
   * @param spec - handler 产出的请求描述
   * @param operation - 出错时写进错误的操作名
   * @throws HttpResponseError 响应状态非 2xx（带数字 `status`）
   * @throws NetworkOfflineError 传输失败或单请求超时
   * @throws HttpDisconnectedError 请求被 `disconnect()` 取消
   */
  async sendVoid(spec: HttpRequestSpec, operation: string): Promise<void> {
    const response = await this.execute(spec, operation);
    await assertOk(response, this.resolveUrl(spec));
  }

  /**
   * 把请求描述里的相对 URL 拼成最终地址。
   *
   * @remarks
   * 给 `isTableExisted` 用：它按状态码自己分流，抛错时要能报出和其他路径**一致**的 URL。
   * 让调用方自己拼一遍，两处规则迟早分叉。
   */
  resolveUrl(spec: HttpRequestSpec): string {
    return joinUrl(this.options.baseUrl, spec.url);
  }

  /**
   * 发请求并返回原始 `Response`，**不判状态码**。
   *
   * @remarks
   * 给 `isTableExisted` 用：它要把 404 读成「表不存在」而不是失败，
   * 所以判定必须在拿得到 `status` 的这一层做，不能交给会抛错的 {@link sendJson}。
   *
   * @param spec - handler 产出的请求描述
   * @param operation - 出错时写进错误的操作名
   * @returns 原始 `Response`，包括非 2xx
   * @throws NetworkOfflineError 传输失败或单请求超时
   * @throws HttpDisconnectedError 请求被 `disconnect()` 取消
   */
  async execute(spec: HttpRequestSpec, operation: string): Promise<Response> {
    const { baseUrl, disconnectSignal, requestTimeoutMs } = this.options;
    if (disconnectSignal.aborted) {
      throw new HttpDisconnectedError(operation);
    }
    // auth 在 fetch 之前：hook 抛错则请求不发出，且错误原样上抛不被包装——
    // 包成 NetworkOfflineError 会让 token 过期被 offlineFallback 吞成缓存命中
    const headers = await this.buildHeaders(spec);
    const url = joinUrl(baseUrl, spec.url);
    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, requestTimeoutMs);
    // 用 AbortSignal.any 而不是手动挂 abort 监听：上面 await 过 auth hook，
    // 这中间落下的 disconnect() 会让手挂的监听器永远等不到事件，请求一直悬着。
    // any() 对**已经 abort** 的输入信号即刻生效，正好覆盖这个窗口。
    const signal = AbortSignal.any([disconnectSignal, timeoutController.signal]);
    try {
      return await fetch(url, {
        method: spec.method,
        headers,
        body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
        signal
      });
    } catch (error) {
      throw this.classify(error, { operation, url, timedOut });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 合并 header，**auth hook 优先级最高**。
   *
   * @remarks
   * 顺序：适配器默认 → `spec.headers` → auth hook。auth 排最后是因为它是唯一
   * 有正确性含义的一组——被 handler 的静态 header 覆盖掉就是发出一个未认证的请求。
   */
  private async buildHeaders(spec: HttpRequestSpec): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...this.options.headers };
    if (spec.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    Object.assign(headers, spec.headers);
    if (this.options.auth) {
      Object.assign(headers, await this.options.auth());
    }
    return headers;
  }

  /**
   * 把 fetch 的失败归类成三种可判别的错误。
   *
   * @remarks
   * 主动断开与超时都表现为 `AbortError`，靠 `timedOut` 标志分流，而不是靠错误对象——
   * 二者的 `AbortError` 长得一模一样。分错的代价不对称：断开被当成超时会让「用户
   * 叫停」静默变成「读缓存返回」。
   *
   * 传输失败一律包成 core 的 `NetworkOfflineError`，不是自定义类：`isNetworkError`
   * 的第 1 条判据是 `instanceof NetworkOfflineError`，包成别的它认不出，
   * 而 node/undici 的失败消息 `fetch failed` 又不命中第 5 条的正则——两头落空。
   */
  private classify(error: unknown, ctx: { operation: string; url: string; timedOut: boolean }): Error {
    if (ctx.timedOut) {
      return new NetworkOfflineError(
        new Error(`HTTP request to ${ctx.url} exceeded requestTimeoutMs=${this.options.requestTimeoutMs}`)
      );
    }
    if (this.options.disconnectSignal.aborted) {
      return new HttpDisconnectedError(ctx.operation);
    }
    return new NetworkOfflineError(error instanceof Error ? error : new Error(describeError(error)));
  }
}

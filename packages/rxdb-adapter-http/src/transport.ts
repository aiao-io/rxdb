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
import { ConditionalRequestCache, requestFingerprint } from './conditional-cache.js';
import {
  HttpAdapterError,
  HttpDisconnectedError,
  HttpInvalidResponseError,
  HttpRequestBuildError,
  HttpResponseError
} from './errors.js';
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
  /** 条件请求配置；**缺席即禁用**，此时行为与阶段 A 逐字相同（US-212 AC#28） */
  conditional?: { maxEntries: number };
}

/**
 * 参与条件缓存的操作名。
 *
 * @remarks
 * 只有这两个是**幂等读**：AC#28 的原文就是「重复 `fetchMetadata` / `findByIds`」。
 * `create` / `update` / `version` 同样走 {@link HttpTransport.sendJson}，但缓存它们
 * 没有意义（写没有可复用的表示，`version` 一次连接只问一次）。
 *
 * 用操作名而不是 HTTP 方法来判：本包文档里 `onFetchMetadata` 的范例就用 `POST`
 * 递 `RuleGroup`（查询条件放不进 query string 是 JSON 查询 API 的常态），
 * 按 `GET` 过滤会让最主要的用法一条都命不中。
 *
 * 名字对不上的后果是**退回阶段 A 行为**，不是错误结果——这条 fail-safe 由
 * `transport.spec.ts`「写入口与 version 不参与条件缓存」冻结。
 */
const CONDITIONAL_OPERATIONS: ReadonlySet<string> = new Set(['fetchMetadata', 'findByIds']);

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
 * 读完并丢弃不打算解析的响应体。
 *
 * @remarks
 * 「不解析」不等于「不消费」：node/undici 下未消费的 body 会把底层 socket 一直挂着，
 * 直到该 `Response` 被 GC 才归还连接池。表现是高频调用后请求开始排队，全程没有任何报错，
 * 所以只能在**每一条**不读 body 的返回路径上显式收口——`sendVoid` 的 2xx、
 * `isTableExisted` 的 2xx / 404、条件请求的 304 三处。
 *
 * `cancel()` 的失败吞掉：连接已经出问题时它会 reject，而此时调用方要的那个结果
 * （删除成功 / 表存在）已经由状态码给出了，为一次清理动作把它翻成失败是本末倒置。
 */
const discardBody = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined);
};

/**
 * 读非 2xx 的响应体当错误详情，读不出来就算了——**除非是 `disconnect()` 打断的**。
 *
 * @remarks
 * 两种读失败必须分开，因为「状态码是不是仍算数」的答案相反：
 *
 * - **连接中途断 / 超时**：`409` 是远端给出的真实回答，连接当时是通的。丢掉详情、
 *   保留 `HttpResponseError(409)` 才对——判成离线会让 `offlineFallback` 把一次业务
 *   冲突静默换成陈旧缓存。这条由「拿到状态码的响应即使 body 读不完」一例冻结。
 * - **`disconnect()`**：调用方自己叫停，`HttpResponseError` 就是把「我取消了」报成
 *   「服务端出错了」，两者的处置完全相反。`.catch(() => undefined)` 一把吞掉时，
 *   {@link HttpTransport.classify} 本来分得清，只是永远收不到那个错误。
 *
 * 所以判据是**断开信号**而不是错误的形状：超时与断开的 `AbortError` 长得一模一样。
 *
 * @param response - 已拿到状态码的非 2xx 响应
 * @param disconnectSignal - 适配器的断开信号
 * @returns 响应体文本；读失败且非主动断开时为 `undefined`
 */
export const readErrorBody = async (response: Response, disconnectSignal: AbortSignal): Promise<string | undefined> => {
  try {
    return await response.text();
  } catch (error) {
    if (disconnectSignal.aborted) {
      throw error;
    }
    return undefined;
  }
};

/**
 * 非 2xx 即抛，错误里带**数字** `status`。
 *
 * @remarks
 * 那个数字是 `isNetworkError` 第 2 条判据的命中点：拿到状态码说明连接是通的，
 * 于是 401 / 409 / 422 自动不会被 `offlineFallback` 吞成缓存命中。
 */
const assertOk = async (response: Response, url: string, disconnectSignal: AbortSignal): Promise<void> => {
  if (response.ok) {
    return;
  }
  throw new HttpResponseError(response.status, url, await readErrorBody(response, disconnectSignal));
};

/**
 * 序列化请求体。
 *
 * @remarks
 * 单一出口：发出去的字节与条件请求的指纹必须**同源**。两处各 `JSON.stringify` 一次迟早
 * 分叉，而分叉在这里的表现是「指纹换了」——缓存永远不命中，且没有任何报错说明为什么。
 *
 * 失败包成 {@link HttpRequestBuildError} 而不是放它裸奔：`JSON.stringify` 遇 bigint /
 * 循环引用抛的是 `TypeError`，与 `fetch` 传输失败**完全同型**。裸抛出去只要落进
 * `classify()` 就会变成 `NetworkOfflineError`，被 `offlineFallback` 静默换成陈旧缓存。
 *
 * `JSON.stringify` 对函数 / symbol 返回 `undefined` 也算失败：静默发出一个「声明了
 * `content-type: application/json` 却没有 body」的请求，只会在远端表现为莫名其妙的 400。
 */
const serializeBody = (body: unknown, operation: string): string | undefined => {
  if (body === undefined) {
    return undefined;
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(body);
  } catch (error) {
    throw new HttpRequestBuildError('body', operation, describeError(error));
  }
  if (serialized === undefined) {
    throw new HttpRequestBuildError('body', operation, `JSON.stringify() returned undefined for ${typeof body}`);
  }
  return serialized;
};

/**
 * 按 HTTP 语义（大小写不敏感）把一层 header 叠到目标上，后来者覆盖。
 *
 * @remarks
 * 全部小写化再写入：`Headers` 最终也会小写化，提前对齐就不会出现「同一个 header
 * 以两种拼写共存」的中间态。少了这一步，覆盖会静默退化成 RFC 7230 的字段合并
 * （`旧, 新`），而认证 header 上那正是「旧凭据没被换掉」。
 */
const mergeHeaders = (target: Record<string, string>, source?: Record<string, string>): Record<string, string> => {
  for (const [name, value] of Object.entries(source ?? {})) {
    target[name.toLowerCase()] = value;
  }
  return target;
};

/**
 * 借 `Headers` 的解析器校验 header，返回**普通对象**。
 *
 * @remarks
 * 不自己写 RFC 7230 的 token / field-value 规则：多一份实现就多一处会和 `fetch` 分叉的
 * 判定。返回 `Record` 而不是 `Headers` 实例，是因为 wire 上原本就是普通对象，换类型会
 * 让「header 优先级」那组断言换一种写法却测不到新东西。
 *
 * 非法 header 必须在这里就地失败：auth hook 拼出带 CRLF 的 token 时，把请求发出去的
 * 后果是 `fetch` 抛 `TypeError`——又一次和传输失败同型，又一次被当成离线。
 */
const validateHeaders = (headers: Record<string, string>, operation: string): Record<string, string> => {
  try {
    return Object.fromEntries(new Headers(headers));
  } catch (error) {
    throw new HttpRequestBuildError('headers', operation, describeError(error));
  }
};

/** 解码 2xx 响应体；代理返回 `200` + HTML 错误页时给出带 URL 与状态码的错误 */
const decodeJson = async (response: Response, url: string): Promise<unknown> => {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new HttpInvalidResponseError(response.status, url, describeError(error));
  }
};

/**
 * 已构造完毕、可以直接上线的请求。
 *
 * @remarks
 * 存在的意义是把「构造」与「发送」切开：构造在超时窗口**之外**（它不涉及网络，
 * 失败是本地问题），发送在窗口**之内**。切开之后，请求体只序列化一次——条件请求的
 * 指纹与真正发出去的字节读的是同一个 {@link PreparedRequest.body}，从结构上不可能分叉。
 */
interface PreparedRequest {
  /** 已与 baseUrl 拼接完成的绝对地址 */
  url: string;
  method: string;
  /** 已过 `Headers` 解析器校验的 header */
  headers: Record<string, string>;
  /** 已序列化的请求体；无 body 时为 `undefined` */
  body?: string;
}

/**
 * 执行 handler 产出的请求描述。
 *
 * @remarks
 * 一次请求一个 `AbortController`：它同时接超时定时器与适配器的断开信号，
 * 但**记录是谁先触发的**——两者都表现为 `AbortError`，而语义相反。
 * 超时可降级（远端暂时够不着），断开不可降级（是调用方自己叫停的）。
 */
export class HttpTransport {
  /** 条件请求的响应缓存；未启用时为 `undefined`，整条 AC#28 路径随之不存在 */
  readonly #conditional?: ConditionalRequestCache;

  constructor(private readonly options: HttpTransportOptions) {
    this.#conditional = options.conditional && new ConditionalRequestCache(options.conditional.maxEntries);
  }

  /**
   * 发请求并解码 JSON 响应体，非 2xx 抛错。
   *
   * @remarks
   * 启用条件请求且 `operation` 属于 {@link CONDITIONAL_OPERATIONS} 时，本方法额外做两件事
   * （US-212 AC#28）：带上 `if-none-match`、把 304 还原成上次 200 的解析结果。
   * 未启用时这两条都不发生，行为与阶段 A 逐字相同。
   *
   * @param spec - handler 产出的请求描述
   * @param operation - 出错时写进错误的操作名，如 `fetchMetadata`
   * @returns 已 JSON 解码的响应体
   * @throws HttpResponseError 响应状态非 2xx（带数字 `status`）。**未请求校验却收到 304
   *   也走这里**——静默当成空集会让整表判成孤儿
   * @throws HttpInvalidResponseError 状态 2xx 但响应体不是合法 JSON
   * @throws HttpRequestBuildError 请求体不可序列化，或 header 非法（请求不发出）
   * @throws NetworkOfflineError 传输失败或单请求超时
   * @throws HttpDisconnectedError 请求被 `disconnect()` 取消
   */
  async sendJson(spec: HttpRequestSpec, operation: string): Promise<unknown> {
    const prepared = await this.#prepare(spec, operation);
    const cache = this.#conditional;
    if (!cache || !CONDITIONAL_OPERATIONS.has(operation)) {
      return this.#sendJsonDirect(prepared, operation);
    }
    // 指纹读的就是要发出去的那份字节，不再单独 stringify 一次
    const key = requestFingerprint(prepared.method, prepared.url, prepared.body);
    return cache.singleFlight(key, () => this.#sendJsonConditional(cache, key, prepared, operation));
  }

  /**
   * 清空条件请求缓存。
   *
   * @remarks
   * 由适配器的 `disconnect()` 调用（AC#28 的「`disconnect()` 清空」）。未启用条件请求时
   * 是 no-op——没有缓存可清，不是错误。
   */
  clearConditionalCache(): void {
    this.#conditional?.clear();
  }

  /**
   * 发请求、只判状态码，**不碰响应体**。
   *
   * @remarks
   * 给 `delete` duck 用：core 的 duck 签名返回 `Observable<void>`，没有可解析的东西，
   * 而 `204 No Content` 的空体喂给 {@link sendJson} 会当场变成「响应体不是合法 JSON」——
   * 一次成功的删除被报成协议错误。
   *
   * 不解析但要**读完**：理由见 {@link discardBody}。非 2xx 那一支由 `assertOk` 的
   * `response.text()` 顺带消费掉，只有成功路径需要显式收口。
   *
   * @param spec - handler 产出的请求描述
   * @param operation - 出错时写进错误的操作名
   * @throws HttpResponseError 响应状态非 2xx（带数字 `status`）
   * @throws HttpRequestBuildError 请求体不可序列化，或 header 非法（请求不发出）
   * @throws NetworkOfflineError 传输失败或单请求超时
   * @throws HttpDisconnectedError 请求被 `disconnect()` 取消
   */
  async sendVoid(spec: HttpRequestSpec, operation: string): Promise<void> {
    await this.execute(spec, operation, async response => {
      await assertOk(response, this.resolveUrl(spec), this.options.disconnectSignal);
      await discardBody(response);
    });
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
   * 发请求，并在**超时窗口内**消费响应。
   *
   * @remarks
   * 给 `isTableExisted` 用：它要把 404 读成「表不存在」而不是失败，
   * 所以判定必须在拿得到 `status` 的这一层做，不能交给会抛错的 {@link sendJson}。
   *
   * 交出的是 `consume` 回调而不是 `Response`：**响应体也必须罩在同一个 deadline 下**。
   * 详见 {@link HttpTransport.#send}。
   *
   * @param spec - handler 产出的请求描述
   * @param operation - 出错时写进错误的操作名
   * @param consume - 在超时窗口内消费 `Response`；抛出的 {@link HttpAdapterError} 原样透出
   * @returns `consume` 的返回值
   * @throws HttpRequestBuildError 请求体不可序列化，或 header 非法（请求不发出）
   * @throws NetworkOfflineError 传输失败或单请求超时
   * @throws HttpDisconnectedError 请求被 `disconnect()` 取消
   */
  async execute<T>(spec: HttpRequestSpec, operation: string, consume: (response: Response) => Promise<T>): Promise<T> {
    return this.#send(await this.#prepare(spec, operation), operation, consume);
  }

  /**
   * 合并 header，**auth hook 优先级最高**。
   *
   * @remarks
   * 顺序：适配器默认 → `spec.headers` → auth hook。auth 排最后是因为它是唯一
   * 有正确性含义的一组——被 handler 的静态 header 覆盖掉就是发出一个未认证的请求。
   *
   * 合并必须**大小写不敏感**（见 {@link mergeHeaders}），否则「排最后」根本不等于「覆盖」：
   * 静态配置写 `Authorization`、auth hook 返回 `authorization`，`Object.assign` 按字面键
   * 当成两个 header 全留下，`Headers` 再按 RFC 把同名字段合并成 `旧, 新`——
   * 请求带着一个过期凭据和一个新凭据一起上线，且没有任何一步报错。
   */
  private async buildHeaders(spec: HttpRequestSpec): Promise<Record<string, string>> {
    const headers: Record<string, string> = mergeHeaders({}, this.options.headers);
    if (spec.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    mergeHeaders(headers, spec.headers);
    if (this.options.auth) {
      mergeHeaders(headers, await this.options.auth());
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
    // 已经判别过的错误原样放行：`consume` 现在跑在 try 内，`assertOk` 的
    // `HttpResponseError(409)` 会路过这里。再包一层就是把「远端说不行」降级成
    // 「远端够不着」，`offlineFallback` 随即把一次业务冲突换成一份陈旧缓存。
    if (error instanceof HttpAdapterError) {
      return error;
    }
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

  /**
   * 构造请求：拼 URL、跑 auth hook、校验 header、序列化 body。
   *
   * @remarks
   * 整段刻意留在超时窗口**之外**，因为它一个字节都不上网——这里的失败全是本地问题
   * （token 刷新失败、配置里的 header 非法、要发的数据带 bigint），
   * 用「远端够不着」的错误去描述它们，只会把排查方向整个引偏。
   *
   * 断开检查放最前：已经 `disconnect()` 了就别再去打扰 auth hook。
   */
  async #prepare(spec: HttpRequestSpec, operation: string): Promise<PreparedRequest> {
    if (this.options.disconnectSignal.aborted) {
      throw new HttpDisconnectedError(operation);
    }
    // auth 在 fetch 之前：hook 抛错则请求不发出，且错误原样上抛不被包装——
    // 包成 NetworkOfflineError 会让 token 过期被 offlineFallback 吞成缓存命中
    const headers = await this.buildHeaders(spec);
    return {
      url: joinUrl(this.options.baseUrl, spec.url),
      method: spec.method,
      headers: validateHeaders(headers, operation),
      body: serializeBody(spec.body, operation)
    };
  }

  /**
   * 发送已构造好的请求，并在同一个 deadline 下消费响应。
   *
   * @remarks
   * **`consume` 在 `try` 内、`clearTimeout` 之前跑，这是本方法存在的全部理由。**
   * `fetch` 只 resolve 到 header 为止；此时就清掉定时器、把 `Response` 交出去，
   * 剩下的 `text()` / `cancel()` 便再无任何时限——远端回一个状态行然后把 body 挂住
   * （slow loris，也可能只是链路半死），调用方的 Promise 就永不 settle。
   * AC#34 的「防挂起」于是只在 header 段成立，body 段完全裸奔。
   *
   * 同理，此时的 `disconnect()` 会让 body 流抛裸 `AbortError`：它绕过 {@link classify}，
   * `isNetworkError` 判 false，「断开一律 `HttpDisconnectedError`」的契约随之失守。
   */
  async #send<T>(request: PreparedRequest, operation: string, consume: (response: Response) => Promise<T>): Promise<T> {
    const { disconnectSignal, requestTimeoutMs } = this.options;
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
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal
      });
      return await consume(response);
    } catch (error) {
      throw this.classify(error, { operation, url: request.url, timedOut });
    } finally {
      clearTimeout(timer);
    }
  }

  /** 阶段 A 的原始路径：发、判状态、解码，不碰缓存 */
  async #sendJsonDirect(prepared: PreparedRequest, operation: string): Promise<unknown> {
    return this.#send(prepared, operation, async response => {
      await assertOk(response, prepared.url, this.options.disconnectSignal);
      return decodeJson(response, prepared.url);
    });
  }

  /**
   * 条件请求路径：带 ETag 去问，按 304 / 200 两分支收口。
   *
   * @remarks
   * **条目在发请求前就地捕获，之后不再回查缓存。** 回查会引入一个真实的空洞：并发的
   * 另一条链路可能在这期间把条目挤出去（LRU 有界），于是 304 找不到可还原的 body。
   * 捕获后 304 永远有对应的值，与缓存的后续变动无关。
   *
   * `cached` 为空时**不发** `if-none-match`，所以此时的 304 只能是远端不合协议——
   * 交给 `assertOk` 抛 `HttpResponseError(304)`，绝不还原成空集。
   *
   * 304 走 `takeValue()` 取**副本**：返回缓存自己那份对象，上游任何一次就地改行都会
   * 让之后每次 304 都带着被改过的数据回来（详见 `conditional-cache.ts` 类头「隔离」）。
   */
  async #sendJsonConditional(
    cache: ConditionalRequestCache,
    key: string,
    prepared: PreparedRequest,
    operation: string
  ): Promise<unknown> {
    const cached = cache.get(key);
    // ETag 来自远端响应头，已过一遍 Headers 解析器，不需要再校验一次
    const request = cached ? { ...prepared, headers: { ...prepared.headers, 'if-none-match': cached.etag } } : prepared;
    return this.#send(request, operation, async response => {
      if (cached && response.status === 304) {
        // 304 按 RFC 无 body，但代理与打桩实现都可能带一个，仍要收口
        await discardBody(response);
        return cached.takeValue();
      }
      await assertOk(response, prepared.url, this.options.disconnectSignal);
      return this.#cacheAndReturn(cache, key, prepared.url, response);
    });
  }

  /**
   * 收下 200 的解析结果，顺带维护 ETag 条目。
   *
   * @remarks
   * 从 {@link #sendJsonConditional} 里拆出来纯为压嵌套：`consume` 回调本身已经占掉一层，
   * 内联写下去 `if (etag === null)` 就是第四层。
   */
  async #cacheAndReturn(
    cache: ConditionalRequestCache,
    key: string,
    url: string,
    response: Response
  ): Promise<unknown> {
    const value = await decodeJson(response, url);
    const etag = response.headers.get('etag');
    if (etag === null) {
      // 远端停发 ETag：留着旧条目就是拿一个再也换不到 304 的令牌去问，
      // 每次都白搭一个请求头，且下一次 200 会被误判成「内容变了」
      cache.delete(key);
      return value;
    }
    cache.set(key, { etag, value });
    return value;
  }
}

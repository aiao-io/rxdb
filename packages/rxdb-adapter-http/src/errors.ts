/**
 * @packageDocumentation
 * HTTP 适配器的错误类型。
 *
 * @remarks
 * **判别位是类名，不是 `code`**（US-212「新错误的判别口径」）。仓库里并存三套口径：
 * 主流按 `name` 判别（core 5 个错误类、supabase 全部错误类），supabase 附带 UPPER_SNAKE
 * 的 `code` 作辅助，而 `RxDBError.ts` 的 `mixed_versioned_cache_transaction` 是**唯一**
 * 用 snake_case `code` 作主判别位的特例——那句「唯一」保护着一条跨故事契约，本包照抄它
 * 就会把「唯一」变成「三个」。因此本包一律：**类名主判别 + UPPER_SNAKE `code` 辅助**。
 *
 * **传输失败不在这里。** 连不上远端时抛的是 core 的 `NetworkOfflineError`，不是本文件的
 * 任何一个类——`isNetworkError` 的第 1 条判据是 `instanceof NetworkOfflineError`，包进
 * 自定义类会让它认不出，`offlineFallback` 静默失效（US-212 AC#13）。
 */

/**
 * HTTP 适配器错误基类。
 *
 * @remarks
 * 只做归类，**不要直接抛它**——调用方按具体子类的类名判别。
 */
export class HttpAdapterError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'HttpAdapterError';
    Object.setPrototypeOf(this, HttpAdapterError.prototype);
  }
}

/**
 * 构造期配置校验失败（US-212 AC#31）。
 *
 * @remarks
 * 消息**必须**含字段名与实际值：构造期报错没有调用栈上下文，不带字段名等于让接入方猜。
 */
export class HttpConfigError extends HttpAdapterError {
  constructor(
    message: string,
    readonly field: string,
    readonly value: unknown
  ) {
    super(message, 'CONFIG_ERROR');
    this.name = 'HttpConfigError';
    Object.setPrototypeOf(this, HttpConfigError.prototype);
  }
}

/**
 * v1 不支持 changelog / 分支同步（US-212 AC#10、#26）。
 *
 * @remarks
 * 返回空数组或 `0` **算失败**：Full/Filter 会把它读成「远端无变更」并覆盖本地认知。
 * unsupported throw 是唯一诚实行为。
 */
export class HttpChangelogUnsupportedError extends HttpAdapterError {
  constructor(readonly operation: string) {
    super(`HTTP adapter does not support changelog operation "${operation}" (v1 has no Full-sync)`, 'CHANGELOG_UNSUPPORTED');
    this.name = 'HttpChangelogUnsupportedError';
    Object.setPrototypeOf(this, HttpChangelogUnsupportedError.prototype);
  }
}

/**
 * 实体声明了本故事未定义 wire codec 的字段类型（US-212 AC#15）。
 *
 * @remarks
 * 在 `connect()` 扫描时抛，不是等首次查询。`JSON.stringify` 会把 `7n` 弄丢、
 * 把 `Uint8Array` 塌成 `{"0":1,…}`——US-018 已经为同一类静默丢失付过学费。
 */
export class HttpUnsupportedWireTypeError extends HttpAdapterError {
  constructor(
    readonly entity: string,
    readonly property: string,
    readonly propertyType: string
  ) {
    super(
      `HTTP adapter has no wire codec for property type "${propertyType}" at "${entity}.${property}"`,
      'UNSUPPORTED_WIRE_TYPE'
    );
    this.name = 'HttpUnsupportedWireTypeError';
    Object.setPrototypeOf(this, HttpUnsupportedWireTypeError.prototype);
  }
}

/**
 * 本适配器不支持该操作（US-212 AC#24、AC#32）。
 *
 * @remarks
 * 两类调用点共用：`getRepository` / `saveMany` / `removeMany` / `mutations` 四个
 * v1 无实现的必选成员（默认理由），以及 `version()` 这种「装了对应 handler 才有」的成员
 * （由 `reason` 说明差别）。静默返回空数组 / `undefined` 会让调用方以为操作成功了。
 *
 * `reason` 可覆盖是必要的：`version` 的默认理由「v1 只支持 QueryCache」是错的——
 * 配上 `onVersion` 它就能工作，把接入方指向错误的修复方向比不解释更费时间。
 */
export class HttpUnsupportedOperationError extends HttpAdapterError {
  constructor(
    readonly operation: string,
    readonly reason = 'v1 supports SyncType.QueryCache only'
  ) {
    super(`HTTP adapter does not support "${operation}": ${reason}`, 'UNSUPPORTED_OPERATION');
    this.name = 'HttpUnsupportedOperationError';
    Object.setPrototypeOf(this, HttpUnsupportedOperationError.prototype);
  }
}

/**
 * handler 的 `parse` 返回了不合契约的形态。
 *
 * @remarks
 * handler 是接入方写的代码，本包无法在类型层面担保它的运行时返回值。让一个字符串或
 * `null` 顺着流下去，最终会以「这一页没有行」的面目出现——又是一次静默截断。
 * 在解析出口就拦住，错误里带上是哪个 handler、拿到了什么。
 */
export class HttpHandlerContractError extends HttpAdapterError {
  constructor(
    readonly handler: string,
    readonly entityName: string,
    detail: string
  ) {
    super(`${handler} handler for "${entityName}" returned an unexpected shape: ${detail}`, 'HANDLER_CONTRACT');
    this.name = 'HttpHandlerContractError';
    Object.setPrototypeOf(this, HttpHandlerContractError.prototype);
  }
}

/** 翻页 fail-fast 的四种成因（US-212 AC#7）。 */
export type HttpPaginationFailure =
  /** 同一次查询中途换了返回形态（数组 ↔ 游标对象） */
  | 'shape_switch'
  /** `nextCursor` 与上一页相同，再翻就是死循环 */
  | 'cursor_not_advancing'
  /** 连续空页达到 `maxEmptyPages`，远端在空转 */
  | 'empty_page_limit'
  /** 总页数超过 `maxPages` */
  | 'max_pages';

/**
 * 翻页过程中检测到退化的 handler / 远端（US-212 AC#7）。
 *
 * @remarks
 * 四种成因共用一个类、由 {@link HttpPaginationError.reason} 区分——它们是同一类故障
 * （翻页无法安全终止）的不同触发点，拆成四个类只会让 `catch` 侧多写三个 `instanceof`。
 * AC#7 要求的「各自抛可区分的错误」由 `reason` 满足，且四条各有独立用例。
 *
 * **任何一种都不得返回已拿到的部分结果**——那就是把静默截断搬进了客户端，
 * 正是本包要防的假孤儿。
 */
export class HttpPaginationError extends HttpAdapterError {
  constructor(
    readonly reason: HttpPaginationFailure,
    message: string
  ) {
    super(message, 'PAGINATION_ERROR');
    this.name = 'HttpPaginationError';
    Object.setPrototypeOf(this, HttpPaginationError.prototype);
  }
}

/**
 * 远端返回的 metadata 不合契约（US-212 AC#14）。
 *
 * @remarks
 * 覆盖两类：缺 `id` / `updatedAt` 字段，以及 `updatedAt` 不是合法 ISO 8601 时间串。
 * 后者**不能靠类型检查拦住**——不规范的字符串照样是 `string`，`diffMetadata` 照常运行，
 * 错的只是结论（字典序比较得出反向答案，缓存卡死或无谓重拉）。
 */
export class HttpInvalidMetadataError extends HttpAdapterError {
  constructor(
    readonly entityName: string,
    readonly detail: string
  ) {
    super(`HTTP adapter received invalid metadata for "${entityName}": ${detail}`, 'INVALID_METADATA');
    this.name = 'HttpInvalidMetadataError';
    Object.setPrototypeOf(this, HttpInvalidMetadataError.prototype);
  }
}

/**
 * 适配器已断开：请求被 `disconnect()` 取消，或断开后仍调用 duck（US-212 AC#24、#34）。
 *
 * @remarks
 * **必须与超时可区分。** 超时抛 core 的 `NetworkOfflineError`（`isNetworkError` 判 `true`，
 * 可降级到缓存）；主动断开抛本类（判 `false`，**不得**降级——「取消」静默变成「返回缓存」
 * 是 core 的 `NETWORK_ERROR_NAMES` 特意排除 `AbortError` 要防的事）。
 *
 * 本类既不叫 `NetworkError`/`TimeoutError`，也不带数字 `status`，因此 `isNetworkError`
 * 五条判据一条不中，稳定判 `false`。
 */
export class HttpDisconnectedError extends HttpAdapterError {
  constructor(readonly operation: string) {
    super(`HTTP adapter is disconnected; "${operation}" was cancelled or rejected`, 'DISCONNECTED');
    this.name = 'HttpDisconnectedError';
    Object.setPrototypeOf(this, HttpDisconnectedError.prototype);
  }
}

/**
 * 响应状态是 2xx，但响应体不是合法 JSON（US-212 AC#12）。
 *
 * @remarks
 * 真实形态：代理或网关返回 `200` + HTML 错误页。裸 `SyntaxError` 冒到调用方那里
 * 既没有 URL 也没有状态码，只能靠猜。
 *
 * 与 {@link HttpResponseError} 一样**带数字 `status`**：请求确实拿到了响应，
 * 连接是通的，`isNetworkError` 判 `false`，不该降级到缓存。
 */
export class HttpInvalidResponseError extends HttpAdapterError {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly detail: string
  ) {
    super(`HTTP ${status} from ${url} returned a non-JSON body: ${detail}`, 'INVALID_RESPONSE');
    this.name = 'HttpInvalidResponseError';
    Object.setPrototypeOf(this, HttpInvalidResponseError.prototype);
  }
}

/**
 * 远端返回了非 2xx 响应（US-212 AC#12）。
 *
 * @remarks
 * **必须带数字 `status`**：`isNetworkError` 的第 2 条判据「拿到了状态码就说明连接是通的」
 * 一命中即判非网络错误，401 / 409 / 422 于是自动不会被 `offlineFallback` 吞成缓存命中。
 * 反过来说——传输失败抛出的错误**绝不能**带 `status`，那会把分类结果原地抵消。
 */
export class HttpResponseError extends HttpAdapterError {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body?: string
  ) {
    super(`HTTP ${status} from ${url}`, 'HTTP_RESPONSE_ERROR');
    this.name = 'HttpResponseError';
    Object.setPrototypeOf(this, HttpResponseError.prototype);
  }
}

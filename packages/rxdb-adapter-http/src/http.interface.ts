/**
 * @packageDocumentation
 * HTTP 适配器的公开类型：请求描述、handler 契约与适配器配置。
 *
 * @remarks
 * **责任划分：适配器持有 transport。** 发请求的是适配器，不是 handler——只有发请求的人
 * 能保证 auth hook 在请求前调用、错误对象带数字 `status`、传输失败不被包装、翻页与分块
 * 的终止判据统一。handler 因此**不是不透明函数**，而是**纯协议 mapping**：给出请求描述、
 * 解析响应体，全程不碰网络。
 *
 * 代价写明：用户不能换用 axios / ky 等自带 HTTP 客户端。阶段 A **不提供** transport 覆盖点，
 * 需要时另开故事——留一个可选 `transport` 参数会让上面那句 owner 出现两种答案。
 */

import type { QueryCacheEntityMetadata, RuleGroup } from '@aiao/rxdb';

/**
 * handler 可以产出的 HTTP 方法。
 *
 * @remarks
 * 含 `HEAD` 是为 `isTableExisted` 探测留的：判定只看状态码，拉响应体是白费带宽。
 */
export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * handler 产出、**适配器执行**的请求描述。
 *
 * @remarks
 * auth header 由适配器叠加，不在这里写。
 */
export interface HttpRequestSpec {
  /** 绝对 URL，或相对于 `baseUrl` 的路径 */
  url: string;
  method: HttpMethod;
  /** 适配器负责 JSON 序列化 */
  body?: unknown;
  /** 附加 header；与 auth hook 冲突时 **auth hook 优先** */
  headers?: Record<string, string>;
}

/**
 * 单页 `fetchMetadata` 请求的上下文。
 *
 * @remarks
 * **这一族类型不带实体类型参数**，`where` / `data` 一律是 `unknown` 侧的形态。
 * 一个适配器实例服务**所有**挂在它 remote 槽位上的实体，单个类型参数只能取成联合类型
 * （`RuleGroup<A | B>` 会把字段收窄到两者的交集，比不写还糟）或 `unknown`；而 core 递进来的
 * 本就是 `RuleGroup<unknown>`，写成 `RuleGroup<T>` 只能靠一次没人验证的 `as` 转换成立——
 * 那是把类型当注释用。需要收窄的接入方在**自己的** handler 里标注参数即可
 * （方法签名双变，`(ctx: FetchMetadataContext) => …` 允许更窄的入参）。
 */
export interface FetchMetadataContext {
  entityName: string;
  where: RuleGroup<unknown>;
  /** 本页起始偏移；token 形态可忽略 */
  offset: number;
  /** 来自 `pageSize`，适配器保证为 finite 正整数 */
  limit: number;
  /**
   * 上一页返回的 `nextPageToken`；首页为 `undefined`。
   *
   * @remarks
   * **不透明**：适配器只做「相等 / 不等 / 是否 `undefined`」三种判断，不解析内部结构。
   * 刻意不叫 `cursor`——core 的 `findByCursor` 用「游标」指**实体实例**做的 keyset 锚点，
   * 那种游标会在 Repository 里被编译成 `where` 规则组、可以拆字段比较，适配器根本看不到；
   * 这个只能原样送回远端。同名会让人以为后者也能拆开看。
   */
  pageToken?: string;
}

/**
 * 单页解析结果，两种形态**判别式**返回。
 *
 * @remarks
 * 适配器按**首页的返回形状**锁定本次查询的翻页模式，中途换形态即抛错
 * （`HttpPaginationError`，`reason: 'shape_switch'`）——混用会让两条终止判据互相盖掉，
 * 正是本包要防的静默截断。
 *
 * 对象形态的键叫 `nextPageToken`。返回改名前的 `nextCursor` 会被当场判为契约错误
 * （`HttpHandlerContractError`）而**不是**读成 `undefined`：后者等于首页即末页，
 * 整表只剩第一页而全程不报错。
 */
export type FetchMetadataResult =
  /** 形态 1（`offset`）：短页终止（`rows.length < limit` 即末页） */
  | QueryCacheEntityMetadata[]
  /** 形态 2（`token`）：token 终止（`nextPageToken === undefined` 即末页） */
  | { rows: QueryCacheEntityMetadata[]; nextPageToken?: string };

/**
 * `fetchMetadata` 的协议 mapping。
 *
 * @remarks
 * offset 形态依赖一条**服务端保证**：返回少于 `limit` 条即最后一页，不得因限流、超时或
 * 服务端 max-rows 提前返回短页；跨页排序稳定；一次查询内快照一致。
 * **任一条不满足的服务端 MUST 用 token 形态**——适配器无法在客户端侧检测短页截断。
 */
export interface FetchMetadataHandler {
  /**
   * 产出本页请求描述。纯函数，不碰网络。
   *
   * @remarks
   * **必须把翻页位置编码进 URL 或 body**：offset 形态编 `ctx.offset`，token 形态编 `ctx.pageToken`。
   * 适配器只按返回的行数与 token 决定要不要继续翻，无从检查请求里带没带位置——漏掉的表现是
   * 远端每页都回第一页，翻页一直不推进，直到 `maxPages` 触顶抛错，而错误信息指向的是
   * 页数上限，不是漏掉的那个参数。
   *
   * 开了 `conditionalRequests` 会让这个症状更难认：请求指纹取自实际发出的
   * method + URL + body，位置没进去就意味着所有页共用一个指纹，第 2 页起全是 304，
   * 重放的还是第一页。
   */
  request(ctx: FetchMetadataContext): HttpRequestSpec;
  /** 解析已 JSON 解码的响应体。抛错 = 本次 `fetchMetadata` 失败，不吞不重试 */
  parse(body: unknown, ctx: FetchMetadataContext): FetchMetadataResult;
}

/** 单块 `findByIds` 请求的上下文。 */
export interface FindByIdsContext {
  entityName: string;
  /** 长度 ≤ `idChunkSize` */
  ids: string[];
}

/**
 * `findByIds` 的协议 mapping。
 *
 * @remarks
 * 某块返回的行数**少于**该块 id 数是**合法**结果（远端确实删了），
 * 适配器不会据此重试或补空对象。
 */
export interface FindByIdsHandler {
  /** 产出本块请求描述。纯函数，不碰网络 */
  request(ctx: FindByIdsContext): HttpRequestSpec;
  /** 解析已 JSON 解码的响应体 */
  parse(body: unknown, ctx: FindByIdsContext): unknown[];
}

/**
 * `create` 写入口的上下文。
 *
 * @remarks
 * `data` 是 `unknown`：core 的 duck 签名是 `create<R>(entityName, data: R)`，行类型由
 * **每次调用**决定，不由适配器实例决定（理由同 {@link FetchMetadataContext}）。
 */
export interface CreateContext {
  entityName: string;
  data: unknown;
}

/** `update` 写入口的上下文。`data` 是调用方给的部分字段，理由同 {@link CreateContext}。 */
export interface UpdateContext {
  entityName: string;
  id: string;
  data: unknown;
}

/**
 * `delete` 写入口的上下文。
 *
 * @remarks
 * `ids` 恒为数组：core 的 duck 签名是 `delete(entityName, ids: string | string[])`，
 * 单值那一支由适配器在边界归一，handler 只需处理数组。
 */
export interface DeleteContext {
  entityName: string;
  ids: string[];
}

/** `create` 的协议 mapping。 */
export interface CreateHandler {
  request(ctx: CreateContext): HttpRequestSpec;
  /**
   * 解析响应体为**写入后**的完整实体（远端可能补了 id / updatedAt）。
   *
   * @remarks
   * 必须解析远端回执、**不能回显入参**：id 与时间戳由远端决定，回显会让本地留下一条
   * 远端从不存在的行。
   */
  parse(body: unknown, ctx: CreateContext): unknown;
}

/** `update` 的协议 mapping。 */
export interface UpdateHandler {
  request(ctx: UpdateContext): HttpRequestSpec;
  parse(body: unknown, ctx: UpdateContext): unknown;
}

/**
 * `delete` 的协议 mapping。
 *
 * @remarks
 * 没有 `parse`：core 的 duck 返回 `Observable<void>`，响应体无处可去。
 */
export interface DeleteHandler {
  request(ctx: DeleteContext): HttpRequestSpec;
}

/** `version()` 的协议 mapping。 */
export interface VersionHandler {
  request(): HttpRequestSpec;
  /** 解析出**远端服务端版本**，与 sqlite / pglite / supabase 三家口径一致 */
  parse(body: unknown): string;
}

/**
 * `isTableExisted()` 的协议 mapping。
 *
 * @remarks
 * 只需给出探测请求：判定完全由适配器按 HTTP 状态码做（2xx → `true`、404 → `false`、
 * 其余与传输失败 → 抛错）。**handler 拿不到 status**，所以这里没有 `parse`——
 * 「不知道」和「不存在」必须区分，而只有 transport 那一层看得见状态码。
 */
export interface IsTableExistedHandler {
  request(ctx: { entityName: string }): HttpRequestSpec;
}

/**
 * 阶段 A 的 handler 集合。
 *
 * @remarks
 * **命名方向要注意**：handler 字段一律带 `on` 前缀，而**适配器类上的方法名不带**。
 * `fetchMetadata` / `findByIds` 是 `RxDBAdapterRemoteBase` 的 abstract，必须同名；
 * `create` / `update` / `delete` 是 `QueryCacheRemoteAdapter` 的 optional duck，
 * `QueryCacheRepository` 先 `if (!this.remoteAdapter.create)` 特性探测再调用——
 * 把类方法也取成 `onCreate` 会让探测判 `false`，写入口静默退化成「不支持 create」，
 * 而配置里明明配了 handler。
 */
export interface HttpHandlers {
  onFetchMetadata: FetchMetadataHandler;
  onFindByIds: FindByIdsHandler;
  onCreate?: CreateHandler;
  onUpdate?: UpdateHandler;
  onDelete?: DeleteHandler;
  /** 未配置则 `version()` 抛 unsupported，**不得**回落到本包 `package.json` 的版本号 */
  onVersion?: VersionHandler;
  /** 未配置则复用 `onFetchMetadata` 的 `limit: 1` 探测 */
  onIsTableExisted?: IsTableExistedHandler;
}

/**
 * auth hook：注入 token / header。
 *
 * @remarks
 * 由适配器**在发请求前**调用，因此「hook 抛错则请求不发出」可由本包担保（AC#16）。
 * 本包不内置 OAuth 流程。
 */
export type HttpAuthHook = () => Record<string, string> | Promise<Record<string, string>>;

/**
 * 「条件请求开着，却读不到 `ETag`」这一刻的**事实**（US-215）。
 *
 * @remarks
 * 字段全是观测值，没有结论：客户端**分不清**读不到 `ETag` 的两种成因——远端根本没发，
 * 或远端发了而跨源响应没把它列进 `Access-Control-Expose-Headers`——二者在
 * `response.headers.get('etag') === null` 上完全重合。替调用方猜一个，在猜错的那一半
 * 情况下会把人送去改一个本来就对的服务端。
 */
export interface HttpEtagUnreadableReport {
  /** 触发的操作名；参与条件缓存的只有 `fetchMetadata` / `findByIds` 两个 */
  operation: string;
  /**
   * 实体名。
   *
   * @remarks
   * 可选只是因为 transport 的 `sendJson` 对所有操作共用一个签名，而 `version` 这类
   * 操作没有实体。**实际触发本回调的两个操作都由实体驱动，所以这里恒有值。**
   */
  entityName?: string;
  /** 发出该请求的绝对 URL */
  url: string;
  /**
   * `Response.type` 原样透出，**不作判定**。
   *
   * @remarks
   * 浏览器里跨源响应是 `'cors'`、同源是 `'basic'`，可作线索。Node（undici）下手工构造的
   * `Response` 恒为 `'default'`，所以这是**线索而非判据**——判断留给拿得到部署拓扑的调用方。
   */
  responseType: ResponseType;
  /** 现成的说明文案：两种成因都点到，且不选边 */
  message: string;
}

/**
 * 诊断回调：条件请求开着却读不到 `ETag` 时被调用。
 *
 * @remarks
 * **同步调用、返回值忽略、抛错被丢弃**（见 `HttpAdapterOptions.onEtagUnreadable`）。
 * 想做异步上报的实现要自己 `catch`：本回调是包内唯一的输出通道，
 * 它自己失败时没有第二条通道可以报告这次失败。
 */
export type HttpEtagUnreadableHook = (report: HttpEtagUnreadableReport) => void;

/**
 * 变更通知通道不可用的那一刻的**事实**（US-023 AC#17）。
 *
 * @remarks
 * 与 {@link HttpEtagUnreadableReport} 同一条判例：字段全是观测值，没有结论。
 * 尤其是**连接为什么失败读不出来**——`EventSource` 的 `error` 事件不带状态码、不带响应体，
 * 「端点没实现（404）」「认证过期（401）」「网络断了」在它上面完全重合。替调用方猜一个，
 * 会把人送去修一个本来就对的地方。
 */
export interface HttpChangeFeedUnavailableReport {
  /** 通知端点的绝对 URL */
  url: string;
  /**
   * 观测到的是哪一类事实。
   *
   * - `unsupported-runtime`：当前运行时没有 `EventSource`（如 Node）。**不会重连**——
   *   重试再多次也变不出一个全局构造器。
   * - `connection-error`：连接建立失败或中途断开。
   * - `malformed-message`：连接是好的，但这一条消息解析不出实体名。
   */
  reason: 'unsupported-runtime' | 'connection-error' | 'malformed-message';
  /** 自上次连接成功以来的失败次数；`unsupported-runtime` 恒为 `0` */
  attempt: number;
  /**
   * 失败时 `EventSource.readyState` 原样透出，**不作判定**。
   *
   * @remarks
   * `0`（CONNECTING）表示浏览器自己正在重连，本包不插手；`2`（CLOSED）表示浏览器已放弃，
   * 重连由本包的退避接管。构造器直接抛错时没有实例可读，因此为 `undefined`。
   */
  readyState?: number;
  /** 本包安排的下次重连延迟（毫秒）；本包这次不重连时为 `undefined` */
  retryInMs?: number;
  /** `malformed-message` 时的原始 `data` 文本；其余情形为 `undefined` */
  data?: string;
  /** 现成的说明文案 */
  message: string;
}

/**
 * 诊断回调：变更通知通道不可用时被调用。
 *
 * @remarks
 * **同步调用、返回值忽略、抛错被丢弃**，与 {@link HttpEtagUnreadableHook} 同一条口径。
 */
export type HttpChangeFeedUnavailableHook = (report: HttpChangeFeedUnavailableReport) => void;

/**
 * 收到一条**读得懂**的变更通知时的事实（US-023 AC#24）。
 *
 * @remarks
 * 这个出口存在的唯一理由是**自回声抑制发生在包内**（D6）：被抑制的那条通知不会走到
 * `RxDB.invalidateRemoteEntity`，包外从 core 的事件流上看它和「压根没收到」一模一样。
 * 想从「后端广播条数 − core 失效条数」倒推抑制数，会把断线期间丢掉的通知一并算进去。
 *
 * **报告结构上带不了行数据**（D8）：字段是固定的这几个，载荷里多出来的键一律不透出。
 * 通知的语义是「某个实体变了」，不是「变成了什么」——本地行只有 `#pull → upsertMany` 一条写入路径。
 */
export interface HttpChangeFeedNotificationReport {
  /** 通知端点的绝对 URL */
  url: string;
  /** 通知里的实体名，原样透出（本客户端没注册的名字也会出现在这里，见 D9） */
  entity: string;
  /** 通知里的命名空间；载荷没带时为 `'public'` */
  namespace: string;
  /** 通知里的发起方 `clientId`；载荷没带时为 `undefined` */
  clientId?: string;
  /**
   * 这条通知是否因为「发起方就是本机」而没有上报失效（D6）。
   *
   * @remarks
   * `true` 时本包**没有**调用 `RxDB.invalidateRemoteEntity`——这不是错误，是本机刚写完、
   * 本地已是最新，再查一次远端纯属白跑。
   */
  suppressed: boolean;
}

/**
 * 诊断回调：收到一条读得懂的变更通知时被调用（无论是否被抑制）。
 *
 * @remarks
 * **同步调用、返回值忽略、抛错被丢弃**，与 {@link HttpChangeFeedUnavailableHook} 同一条口径：
 * 诊断口失败绝不能带塌失效上报。
 */
export type HttpChangeFeedNotificationHook = (report: HttpChangeFeedNotificationReport) => void;

/**
 * 变更通知通道（SSE）的配置（US-023 D5）。
 *
 * @remarks
 * **所有字段都收在这个对象里**，不平铺到 {@link HttpAdapterOptions}：它们离开
 * `changeFeed` 都没有意义，平铺会让「配了 `onChangeFeedUnavailable` 却没配
 * `changeFeed`」这种永不触发的死配置在类型上合法。
 *
 * **认证走不了 `auth` hook。** `EventSource` 发不出自定义 header，这是它的规格而不是
 * 本包的取舍。因此通知端点只能靠 cookie（配 {@link HttpChangeFeedOptions.withCredentials}）
 * 或把凭据编进 `url`。适配器的 `auth` hook **不作用于**这条连接。
 */
export interface HttpChangeFeedOptions {
  /** SSE 端点：绝对 URL，或相对于 `baseUrl` 的路径 */
  url: string;
  /** 跨源连接是否携带 cookie，透传给 `EventSource`。默认 `false` */
  withCredentials?: boolean;
  /** 退避重连的起步延迟（毫秒）。默认 `1000`；必须是 finite 正整数 */
  reconnectBaseDelayMs?: number;
  /** 退避重连的延迟上限（毫秒）。默认 `30000`；必须是 finite 正整数且不小于起步延迟 */
  reconnectMaxDelayMs?: number;
  /**
   * 通道不可用时的诊断回调。
   *
   * @remarks
   * 不配它时通道的行为完全不变（照常退避重连），只是没有嘴——而 D5 明确不给轮询降级，
   * 「连不上」的唯一出口就是这个回调。抛出的错误被丢弃，理由见 {@link HttpChangeFeedUnavailableHook}。
   */
  onUnavailable?: HttpChangeFeedUnavailableHook;
  /**
   * 收到一条读得懂的通知时的诊断回调（含被抑制的自回声）。
   *
   * @remarks
   * 与 {@link HttpChangeFeedOptions.onUnavailable} 对称：一个报「通道没了」，一个报「通道来货了」。
   * 不配它时通道行为完全不变。理由见 {@link HttpChangeFeedNotificationReport}。
   */
  onNotification?: HttpChangeFeedNotificationHook;
}

/** 六个数值配置，全部可覆盖、全部有默认。 */
export interface HttpNumericConfig {
  /** 单页条数，透传为 handler 的 `ctx.limit`。默认 `1000`（对标 `SUPABASE_PAGE_SIZE`） */
  pageSize: number;
  /** `findByIds` 单块 id 数。默认 `100`（对标 `SUPABASE_IN_CHUNK_SIZE`） */
  idChunkSize: number;
  /** token 形态下连续空页容忍上限。默认 `3`；`0` = 不容忍空页 */
  maxEmptyPages: number;
  /** 单次 `fetchMetadata` 总页数上限。默认 `1000`；触顶是**抛错不是截断** */
  maxPages: number;
  /** **单个** HTTP 请求的超时上限（毫秒）。默认 `30000` */
  requestTimeoutMs: number;
  /**
   * 条件请求响应缓存的条目上限。默认 `256`；仅在 `conditionalRequests` 为 `true` 时生效。
   *
   * @remarks
   * 一页 / 一块各占一个条目，所以上限要按**并发活跃查询的总页数**估，不是按实体数。
   * 取太小会让翻页里最热的首页被反复挤出，退化成没有缓存（不产生错误结果）。
   */
  conditionalCacheSize: number;
}

/** `new RxDBAdapterHttp(rxdb, options)` 的配置。 */
export interface HttpAdapterOptions extends Partial<HttpNumericConfig> {
  /** 相对 URL 的基地址；handler 返回绝对 URL 时忽略 */
  baseUrl: string;
  handlers: HttpHandlers;
  auth?: HttpAuthHook;
  /** 附加到所有请求的 header；与 auth hook 冲突时 auth hook 优先 */
  headers?: Record<string, string>;
  /**
   * 启用 ETag / If-None-Match 条件请求（US-212 AC#28）。默认 `false`。
   *
   * @remarks
   * **必须显式开启**，因为它只在远端真的发 `ETag` 并认 `If-None-Match` 时才有收益，
   * 而这一点适配器无从探测。关闭时 `fetchMetadata` / `findByIds` 的行为与阶段 A 逐字相同：
   * 不带条件头、不去重并发、304 照旧当错误。
   *
   * 开启后缓存的是**响应**（上次 200 的 JSON body），不是行——行缓存归 core 经本地适配器
   * 落盘，本包按 AC#19 不碰。缓存按适配器实例存活、有界（{@link HttpNumericConfig.conditionalCacheSize}）、
   * `disconnect()` 时清空。
   *
   * **换用户必须走 `disconnect()` / `connect()`**：auth header 不进请求指纹（否则每次
   * token 轮换都全量失效，等于没有缓存），所以同一实例上直接换 token 会读到上一个身份的响应。
   */
  conditionalRequests?: boolean;
  /**
   * 条件请求开着、响应是 200、却读不到 `ETag` 时被调用（US-215）。
   *
   * @remarks
   * 存在的理由：`conditionalRequests` 开启**前**远端认不认 `If-None-Match` 确实无从探测，
   * 但开启**后**「一次都没生效」是适配器手上就有的铁证——一个 200 响应，条件请求开着，
   * 却读不到 `ETag`。没有这个回调时它知道，只是没有嘴：请求照发、账单照付、缓存零命中，
   * 而客户端侧一行日志都没有。
   *
   * 三条边界，缺一条这个回调就会变成新的麻烦：
   *
   * - **它不改数据路径。** 不配它时的行为与 US-215 之前逐字相同（丢弃该条目、正常返回）；
   *   配了它也一样，回调只是多一次调用。
   * - **它不臆断成因**，只给事实（见 {@link HttpEtagUnreadableReport}）。
   * - **它按缓存 key 去重**，一个 key 只报一次；`disconnect()` 清缓存时一并清掉记录，
   *   所以换了后端配置重连后会重新报。
   *
   * **回调抛出的错误被丢弃**——不是「有别的通道兜着」，是真的没地方去：此刻正在报告的
   * 就是「本包没有输出通道」这件事本身。诊断通道不该成为新的故障源，所以宁可丢。
   * 需要知道自己的上报失败了，请在回调内部自行处理。
   *
   * `conditionalRequests` 关着时**永不触发**：关着的开关不该产生噪音。
   *
   * @example
   * ```ts
   * new RxDBAdapterHttp(rxdb, {
   *   baseUrl,
   *   handlers,
   *   conditionalRequests: true,
   *   onEtagUnreadable: report => myLogger.warn(report.message, report)
   * });
   * ```
   */
  onEtagUnreadable?: HttpEtagUnreadableHook;
  /**
   * 启用变更通知通道（US-023 AC#12）。**缺席即关闭**。
   *
   * @remarks
   * 关着时行为与本故事之前逐字相同：零新增请求、零连接，远端变更靠下一次 `find()`
   * 回远端校验发现。开着时远端一变，订阅同一实体的活查询立刻重跑。
   *
   * 与 `conditionalRequests` 同一条理由必须显式开启：不是所有后端都实现得了推送，
   * 而适配器无从探测——一个不实现该端点的后端，表现是连接被拒，不是「没有变更」。
   *
   * **连不上时不降级成轮询。** 偷偷切一条「每 N 秒问一次」的二等通道，会让接入方拿到一个
   * 说不清延迟上界的实时性，出问题还查不出走的是哪条路。连不上就是连不上，按退避重连并
   * 通过 {@link HttpChangeFeedOptions.onUnavailable} 报出来。
   *
   * **连接成功（含每次重连）会对所有走本适配器的实体各上报一次失效。** 这是正确性要求
   * 不是优化：断开期间发生的变更没有任何人会补发，不主动失效一次，客户端会把「没收到消息」
   * 当成「没有变化」，而这次误判可能一直持续下去。代价是一次 metadata 往返，无变化则零行拉取。
   *
   * @example
   * ```ts
   * new RxDBAdapterHttp(rxdb, {
   *   baseUrl,
   *   handlers,
   *   changeFeed: { url: 'changes', onUnavailable: report => myLogger.warn(report.message, report) }
   * });
   * ```
   */
  changeFeed?: HttpChangeFeedOptions;
}

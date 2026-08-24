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
  /** 本页起始偏移；游标形态可忽略 */
  offset: number;
  /** 来自 `pageSize`，适配器保证为 finite 正整数 */
  limit: number;
  /** 上一页返回的 `nextCursor`；首页为 `undefined` */
  cursor?: string;
}

/**
 * 单页解析结果，两种形态**判别式**返回。
 *
 * @remarks
 * 适配器按**首页的返回形状**锁定本次查询的翻页模式，中途换形态即抛错
 * （`HttpPaginationError`，`reason: 'shape_switch'`）——混用会让两条终止判据互相盖掉，
 * 正是本包要防的静默截断。
 */
export type FetchMetadataResult =
  /** 形态 1：短页终止（`rows.length < limit` 即末页） */
  | QueryCacheEntityMetadata[]
  /** 形态 2：游标终止（`nextCursor === undefined` 即末页） */
  | { rows: QueryCacheEntityMetadata[]; nextCursor?: string };

/**
 * `fetchMetadata` 的协议 mapping。
 *
 * @remarks
 * 数组形态依赖一条**服务端保证**：返回少于 `limit` 条即最后一页，不得因限流、超时或
 * 服务端 max-rows 提前返回短页；跨页排序稳定；一次查询内快照一致。
 * **任一条不满足的服务端 MUST 用游标形态**——适配器无法在客户端侧检测短页截断。
 */
export interface FetchMetadataHandler {
  /** 产出本页请求描述。纯函数，不碰网络 */
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

/** 六个数值配置，全部可覆盖、全部有默认。 */
export interface HttpNumericConfig {
  /** 单页条数，透传为 handler 的 `ctx.limit`。默认 `1000`（对标 `SUPABASE_PAGE_SIZE`） */
  pageSize: number;
  /** `findByIds` 单块 id 数。默认 `100`（对标 `SUPABASE_IN_CHUNK_SIZE`） */
  idChunkSize: number;
  /** 游标形态下连续空页容忍上限。默认 `3`；`0` = 不容忍空页 */
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
}

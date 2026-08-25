/**
 * @packageDocumentation
 * HTTP 远程适配器（US-212 阶段 A）。
 *
 * @remarks
 * v1 只支持 {@link SyncType.QueryCache}：远端权威 + **独立注册**的本地行缓存。
 * 本类是 QueryCache 的**远端**一侧，只有 `fetchMetadata` / `findByIds` 两个必选 duck
 * 加三个可选写入口；行缓存由 core 落到另一个槽位的本地适配器，本类不持有、不调用它。
 * 这条结构隔离由 `RxDBAdapterHttp.spec.ts` 的契约用例冻结（AC#19、AC#25）。
 */

import {
  getEntityMetadata,
  getSyncConfig,
  PropertyType,
  RxDBAdapterRemoteBase,
  type EntityMetadata,
  type EntityType,
  type IRepository,
  type IRxDBAdapter,
  type QueryCacheEntityMetadata,
  type RemoteChange,
  type RemoteMergeResult,
  type RuleGroup,
  type RxDB
} from '@aiao/rxdb';
import { defer, from, map, type Observable } from 'rxjs';
import { findByIdsInChunks } from './chunking.js';
import { resolveHttpConfig } from './config.js';
import {
  HttpChangelogUnsupportedError,
  HttpConfigError,
  HttpDisconnectedError,
  HttpResponseError,
  HttpUnsupportedOperationError,
  HttpUnsupportedWireTypeError
} from './errors.js';
import type {
  CreateContext,
  HttpAdapterOptions,
  HttpHandlers,
  HttpNumericConfig,
  UpdateContext
} from './http.interface.js';
import { fetchAllMetadataPages } from './pagination.js';
import { HttpTransport, readErrorBody } from './transport.js';

/** 适配器注册名 */
export const ADAPTER_NAME = 'http';

/** 未配 handler 时用来探测资源可达性的空条件 */
const MATCH_ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

/** 本包没有 wire codec 的字段类型（AC#15） */
const UNSUPPORTED_WIRE_TYPES = new Set<string>([PropertyType.bigint, PropertyType.binary]);

/**
 * 基于用户自有 REST API 的 QueryCache 远程适配器。
 *
 * @remarks
 * **transport 归本类，不归 handler。** handler 只做协议映射：`request()` 产出请求描述，
 * `parse()` 解码响应体。发请求、注入 auth、提取状态码、分类错误、翻页、分块全在这一侧。
 * 让 handler 自己发请求的话，AC#12 / #13 / #16 三条契约的担保人就变成接入方，
 * 本包只能退化成文档劝告。
 *
 * @example
 * ```typescript
 * const rxdb = new RxDB({
 *   dbName: 'app',
 *   entities: [Recipe],
 *   sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
 * });
 * rxdb.adapter('http', db => new RxDBAdapterHttp(db, {
 *   baseUrl: 'https://api.example.com',
 *   handlers: {
 *     onFetchMetadata: {
 *       request: ctx => ({ url: `${ctx.entityName}/metadata`, method: 'POST', body: ctx }),
 *       parse: body => body as QueryCacheEntityMetadata[]
 *     },
 *     onFindByIds: {
 *       request: ctx => ({ url: `${ctx.entityName}`, method: 'POST', body: { ids: ctx.ids } }),
 *       parse: body => body as unknown[]
 *     }
 *   }
 * }));
 * ```
 */
export class RxDBAdapterHttp extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  #handlers: HttpHandlers;
  #disconnected: AbortController;
  #transport: HttpTransport;

  readonly name = ADAPTER_NAME;

  /** 已校验的数值配置，构造期定型 */
  readonly config: HttpNumericConfig;

  // ============================================
  // QueryCache 写 duck（按 handler 存在与否挂载，AC#4）
  // ============================================

  /**
   * 创建实体。仅在配置了 `onCreate` 时**存在**。
   *
   * @remarks
   * `QueryCacheRepository` 用 `if (!this.remoteAdapter.create)` 做特性探测，所以「不支持」
   * 必须表现为**属性缺席**，不能是一个总在抛错的方法——后者会让探测判 `true`，
   * AC#4 那句清晰的「Remote adapter does not support create」变成运行期意外。
   *
   * 因此这里只 `declare` 类型，实体由构造期的 `#installWriteDucks()` 按需挂上。
   */
  declare create?: <R>(entityName: string, data: R) => Observable<R>;

  /** 更新实体。仅在配置了 `onUpdate` 时存在，理由同 {@link RxDBAdapterHttp.create}。 */
  declare update?: <R>(entityName: string, id: string, data: Partial<R>) => Observable<R>;

  /** 删除实体。仅在配置了 `onDelete` 时存在，理由同 {@link RxDBAdapterHttp.create}。 */
  declare delete?: (entityName: string, ids: string | string[]) => Observable<void>;

  /**
   * @param rxdb - 宿主 RxDB 实例
   * @param options - baseUrl、handlers 与可选的数值/认证配置
   * @throws HttpConfigError baseUrl 为空、缺必选 handler，或任一数值配置不是 finite 正整数
   */
  constructor(
    rxdb: RxDB,
    readonly options: HttpAdapterOptions
  ) {
    super(rxdb);
    assertBaseUrl(options.baseUrl);
    assertRequiredHandlers(options.handlers);
    this.config = resolveHttpConfig(options);
    this.#handlers = options.handlers;
    this.#disconnected = new AbortController();
    this.#transport = this.#createTransport();
    this.#installWriteDucks();
  }

  // ============================================
  // 连接管理（AC#24）
  // ============================================

  /**
   * 不建立长连接，只做本地校验。
   *
   * @remarks
   * **不发探测请求**：远端此刻不可达不代表配置错，那是查询期的网络错误，
   * 交给 `isNetworkError` 分类。想在启动时确认可达性的应用自己调
   * {@link RxDBAdapterHttp.isTableExisted}，那是显式选择而非框架行为。
   *
   * @returns 适配器自身
   * @throws HttpUnsupportedWireTypeError 已注册实体声明了 bigint / binary 字段
   */
  async connect(): Promise<IRxDBAdapter> {
    this.#assertConfiguredEntitiesSupported();
    // 换代之前先收口上一代：重复 connect() 若只是替换字段，旧请求仍绑在旧 signal 上，
    // 而那个 controller 从此没有任何引用能 abort 它——之后的 disconnect() 只取消得了
    // 新一代，旧请求只能等自己超时。等价于「重连隐含断开」，与 disconnect() 同一条口径
    this.#disconnected.abort();
    // 校验通过才重新武装：失败的 connect 不该把上一次的断开状态悄悄解除
    this.#disconnected = new AbortController();
    this.#transport = this.#createTransport();
    return this;
  }

  /**
   * 取消进行中的请求。
   *
   * @remarks
   * 中止走 **error 通道**：complete 一个没发射过的 Observable 会让 core 的 `forkJoin`
   * 静默产出「远端零条」，整表判成孤儿，比抛错危险得多。
   *
   * **已发出的写请求不回滚**——HTTP 没有事务，假装能回滚比不回滚更危险。
   *
   * 顺带清空条件请求缓存（AC#28）：那些响应绑定的是断开前的认证身份与远端状态，
   * 跨越一次断开继续复用，等于让重连后的第一批查询读到上一段连接的世界。
   */
  async disconnect(): Promise<void> {
    this.#disconnected.abort();
    this.#transport.clearConditionalCache();
    return Promise.resolve();
  }

  /**
   * 返回**远端服务端**版本。
   *
   * @remarks
   * 与 sqlite / pglite / supabase 三家口径一致（都返回后端引擎版本）。HTTP 没有内建
   * RPC，因此靠可选的 `onVersion` handler；未配置时抛错而**不**回落到本包
   * `package.json` 的版本号——那是拿适配器版本冒充后端版本。
   *
   * **断开状态先判**：已 `disconnect()` 的适配器上，「未配 `onVersion`」不是调用方
   * 此刻该看见的答案——配置问题下次连上仍在，而生命周期问题是当下这一次调用的实情。
   * 反过来（先判 handler）还会让下面那句 `#assertConnected` 在缺 handler 的路径上
   * 永远走不到，而那条路径正是它存在的两个理由之一（另一个是空 id 列表的 `findByIds`）。
   *
   * @throws HttpDisconnectedError 适配器已断开
   * @throws HttpUnsupportedOperationError 未配置 `onVersion`
   */
  async version(): Promise<string> {
    this.#assertConnected('version');
    const handler = this.#handlers.onVersion;
    if (!handler) {
      throw new HttpUnsupportedOperationError(
        'version',
        'no "onVersion" handler is configured; the adapter must not report its own package version as the backend version'
      );
    }
    const body = await this.#transport.sendJson(handler.request(), 'version');
    return handler.parse(body);
  }

  /**
   * 按**远端资源可达性**回答，不恒 `true` 蒙混。
   *
   * @remarks
   * `2xx` → `true`，`404` → `false`，其余状态码与传输失败 → 抛错。
   * 抛错而不是返回 `false` 是刻意的：「不知道」和「不存在」必须区分，
   * 把 500 读成「表不存在」会让调用方基于一个假答案做决定。
   *
   * 未配 `onIsTableExisted` 时复用 `onFetchMetadata` 的 `limit: 1` 探测。
   *
   * @param EntityType - 要检查的实体类
   */
  async isTableExisted(EntityType: EntityType): Promise<boolean> {
    this.#assertConnected('isTableExisted');
    const entityName = getEntityMetadata(EntityType).name;
    const spec =
      this.#handlers.onIsTableExisted ?
        this.#handlers.onIsTableExisted.request({ entityName })
      : this.#handlers.onFetchMetadata.request({
          entityName,
          where: MATCH_ALL,
          offset: 0,
          limit: 1
        });
    // 判定写成 consume 回调交给 transport：读 body 这一段同样要罩在超时/断开窗口内，
    // 否则「状态行秒回、body 挂死」的远端能让这次探测永不 settle
    return this.#transport.execute(spec, 'isTableExisted', async response => {
      if (response.ok || response.status === 404) {
        // 两支都只看状态码，但 body 仍要读完：node/undici 下未消费的流会把 socket
        // 挂到 GC 才归还，探测频繁时表现为连接池耗尽，且全程不报错
        await response.body?.cancel().catch(() => undefined);
        return response.ok;
      }
      // 读 body 用 transport 那份共享实现：`.catch(() => undefined)` 会把此刻的
      // disconnect() 一起吞掉，最终报出一个 HttpResponseError，把「调用方叫停」
      // 说成「服务端返回错误」
      const body = await readErrorBody(response, this.#disconnected.signal);
      throw new HttpResponseError(response.status, this.#transport.resolveUrl(spec), body);
    });
  }

  // ============================================
  // QueryCache 读 duck
  // ============================================

  /**
   * 拉取满足 `query` 的全部实体元数据。
   *
   * @remarks
   * **恰好发射一次再 complete**（AC#23）。翻页循环整体落在一个 `Promise` 里，
   * `from(promise)` 天然满足这条；逐页发射会让调用方的 `forkJoin` 只留最后一页，
   * 前面各页当场丢失，那些 id 随即被判成「远端已删除」。
   *
   * @param entityName - 实体名
   * @param query - 查询条件，原样透传给 handler
   */
  fetchMetadata(entityName: string, query: RuleGroup<unknown>): Observable<QueryCacheEntityMetadata[]> {
    return defer(() => {
      this.#assertConnected('fetchMetadata');
      return from(
        fetchAllMetadataPages(
          { transport: this.#transport, handler: this.#handlers.onFetchMetadata, config: this.config },
          { entityName, where: query }
        )
      );
    });
  }

  /**
   * 按 id 列表批量拉取完整行。
   *
   * @remarks
   * 与 {@link RxDBAdapterHttp.fetchMetadata} 同款发射契约（AC#33）：所有块合并后
   * 恰好发射一次再 complete。逐块发射丢掉的是要写进本地缓存的完整行。
   *
   * @param entityName - 实体名
   * @param ids - 需要拉取的 id 列表
   */
  findByIds<R>(entityName: string, ids: string[]): Observable<R[]> {
    return defer(() => {
      this.#assertConnected('findByIds');
      return from(
        findByIdsInChunks(
          { transport: this.#transport, handler: this.#handlers.onFindByIds, config: this.config },
          { entityName, ids }
        )
      ).pipe(map(rows => rows as R[]));
    });
  }

  // ============================================
  // v1 无实现的必选成员（AC#32）
  // ============================================

  /**
   * @throws HttpUnsupportedOperationError 总是
   *
   * @remarks
   * QueryCache 的主仓储由 core 用**本地**适配器组装，本类这一侧没有可返回的东西。
   *
   * 这一组连形参都不声明（同 {@link RxDBAdapterHttp.pullChanges}）：函数少写形参照样
   * 满足 `IRxDBAdapter`，而留一个只为凑签名的 `_entities` 会让读者以为它被用上了。
   */
  getRepository<E extends EntityType, RT extends IRepository<E> = IRepository<E>>(): RT {
    throw new HttpUnsupportedOperationError('getRepository');
  }

  /** @throws HttpUnsupportedOperationError 总是（Full/Filter 写路径，v1 无 Full-sync） */
  saveMany<E extends EntityType>(): Promise<InstanceType<E>[]> {
    throw new HttpUnsupportedOperationError('saveMany');
  }

  /** @throws HttpUnsupportedOperationError 总是（同 {@link RxDBAdapterHttp.saveMany}） */
  removeMany<E extends EntityType>(): Promise<InstanceType<E>[]> {
    throw new HttpUnsupportedOperationError('removeMany');
  }

  /**
   * @throws HttpUnsupportedOperationError 总是
   *
   * @remarks
   * 不影响 QueryCache 的批量写：`EntityManager.mutations` 判定为 QueryCache 批后走
   * `#mutations_query_cache` 的 remote-then-local，根本不经过这里。
   */
  mutations<E extends EntityType>(): Promise<InstanceType<E>[]> {
    throw new HttpUnsupportedOperationError('mutations');
  }

  // ============================================
  // changelog 成员（AC#10）
  // ============================================

  /**
   * @throws HttpChangelogUnsupportedError 总是
   *
   * @remarks
   * 返回空数组**算失败**：Full-sync 会把它读成「远端无变更」并覆盖本地认知。
   * v1 没有 changelog，unsupported throw 是唯一诚实行为。
   */
  pullChanges(): Promise<RemoteChange[]> {
    throw new HttpChangelogUnsupportedError('pullChanges');
  }

  /** @throws HttpChangelogUnsupportedError 总是（返回 `0` 同样会被读成「远端无变更」） */
  getChangeCount(): Promise<{ count: number; latestChangeId: number }> {
    throw new HttpChangelogUnsupportedError('getChangeCount');
  }

  /** @throws HttpChangelogUnsupportedError 总是 */
  mergeChanges(): Promise<RemoteMergeResult | number | void> {
    throw new HttpChangelogUnsupportedError('mergeChanges');
  }

  // `pullChangesBatch` / `pushBranches` / `branchExists` / `pullBranches` 一律**不实现**：
  // 它们的调用点都做特性探测，缺席即回落到同样 throw 的成员（AC#11、AC#26）。
  // 写一个返回 `[]` / `false` 的版本会让 Full-sync 与分支同步以为远端确实空着。

  // ============================================
  // 内部
  // ============================================

  #createTransport(): HttpTransport {
    return new HttpTransport({
      baseUrl: this.options.baseUrl,
      requestTimeoutMs: this.config.requestTimeoutMs,
      disconnectSignal: this.#disconnected.signal,
      auth: this.options.auth,
      headers: this.options.headers,
      // 缺席即禁用：AC#28 要求未启用时行为与阶段 A 逐字相同，
      // 传一个 `{ enabled: false }` 会让那句话依赖 transport 内部再判一次
      conditional:
        this.options.conditionalRequests === true ? { maxEntries: this.config.conditionalCacheSize } : undefined
    });
  }

  /**
   * 断开后任何 duck 调用都抛错。
   *
   * @remarks
   * transport 自己也查这一位，但有两条路径够不到它：`findByIds` 传空列表时一个请求都不发，
   * `version` 未配 handler 时同理。那两条上「已断开」会悄悄退化成「远端没有这些行」。
   */
  #assertConnected(operation: string): void {
    if (this.#disconnected.signal.aborted) {
      throw new HttpDisconnectedError(operation);
    }
  }

  /** 按 handler 的有无挂载三个可选写 duck（AC#4 的特性探测语义） */
  #installWriteDucks(): void {
    const { onCreate, onUpdate, onDelete } = this.#handlers;
    if (onCreate) {
      this.create = <R>(entityName: string, data: R): Observable<R> => {
        // 行类型 `R` 是 core duck 签名里**调用方声明**的东西，HTTP 这一侧没有任何手段验证它。
        // 把 `as R` 收在这一行，好过让它以 `CreateContext<T>` 的形式伪装成静态保证
        const ctx: CreateContext = { entityName, data };
        return defer(() => {
          this.#assertConnected('create');
          return from(this.#transport.sendJson(onCreate.request(ctx), 'create'));
        }).pipe(map(body => onCreate.parse(body, ctx) as R));
      };
    }
    if (onUpdate) {
      this.update = <R>(entityName: string, id: string, data: Partial<R>): Observable<R> => {
        const ctx: UpdateContext = { entityName, id, data };
        return defer(() => {
          this.#assertConnected('update');
          return from(this.#transport.sendJson(onUpdate.request(ctx), 'update'));
        }).pipe(map(body => onUpdate.parse(body, ctx) as R));
      };
    }
    if (onDelete) {
      this.delete = (entityName: string, ids: string | string[]): Observable<void> =>
        defer(() => {
          this.#assertConnected('delete');
          // core 的 duck 签名是 `string | string[]`，归一由本包做：让每个 handler
          // 各自判一次类型，迟早有一个把单个 id 当成字符数组
          return from(
            this.#transport.sendVoid(onDelete.request({ entityName, ids: Array.isArray(ids) ? ids : [ids] }), 'delete')
          );
        });
    }
  }

  /** 扫描所有走本适配器 remote 槽位的实体（AC#15） */
  #assertConfiguredEntitiesSupported(): void {
    // 目标实体的元数据从**同一份实体清单**里查，不走 schemaManager：后者要等
    // `RxDB.connect()` 里的 `schemaManager.init()` 填好，而本方法在直接调用
    // `adapter.connect()` 时也必须给出同一个答案，否则扫描会因为一张空表静默放行
    const byName = new Map<string, EntityMetadata>();
    for (const EntityType of this.rxdb.config.entities) {
      const metadata = getEntityMetadata(EntityType);
      byName.set(entityKey(metadata.name, metadata.namespace), metadata);
    }
    for (const metadata of byName.values()) {
      this.#assertEntitySupported(metadata, byName);
    }
  }

  #assertEntitySupported(metadata: EntityMetadata, byName: Map<string, EntityMetadata>): void {
    const sync = getSyncConfig(metadata, this.rxdb.config.sync);
    // bigint 只有在**要过 HTTP 线**时才是问题：本地实体带 bigint 与本包无关
    if (sync?.remote?.adapter !== ADAPTER_NAME) {
      return;
    }
    const property = findUnsupportedProperty(metadata, byName);
    if (!property) {
      return;
    }
    throw new HttpUnsupportedWireTypeError(metadata.name, property.name, property.type);
  }
}

/** 实体在清单里的唯一键；namespace 参与是因为同名实体可以分属不同 namespace */
const entityKey = (name: string, namespace: string): string => `${namespace}\u0000${name}`;

/**
 * 找出第一个没有 wire codec 的字段。
 *
 * @remarks
 * `JSON.stringify` 会把 `7n` 抛成 `TypeError`、把 `Uint8Array` 塌成 `{"0":1,…}`，
 * 后者尤其阴——它不报错，只是把二进制悄悄换成一个对象。US-018 已经为同一类静默丢失
 * 付过一次学费，所以这里在连接期就拦。
 *
 * **外键列要单独扫一遍。** 它们不在 `propertyMap` 里——那张表来自 `@Entity` 的
 * `properties`，而 `authorId` 是 `foreignKeyRelationMap` 从 `relations` 派生出来的。
 * 只看 `propertyMap` 的话，一个自身字段全合法、却指向 bigint 主键实体的实体会被放行，
 * 而它的 `authorId` 照样要过这条 HTTP 线。判定口径与 supabase 的
 * `getUnsupportedProperty()` 逐字一致：取目标实体 `id` 的类型。
 */
const findUnsupportedProperty = (
  metadata: EntityMetadata,
  byName: Map<string, EntityMetadata>
): { name: string; type: string } | undefined => {
  for (const property of metadata.propertyMap.values()) {
    if (UNSUPPORTED_WIRE_TYPES.has(property.type)) {
      return { name: property.name, type: property.type };
    }
  }
  for (const [foreignKeyName, relation] of metadata.foreignKeyRelationMap) {
    const target = byName.get(entityKey(relation.mappedEntity, relation.mappedNamespace ?? metadata.namespace));
    const type = target?.propertyMap.get('id')?.type;
    if (type !== undefined && UNSUPPORTED_WIRE_TYPES.has(type)) {
      return { name: foreignKeyName, type };
    }
  }
  return undefined;
};

/** baseUrl 必须是非空串：空 baseUrl 会把相对 URL 拼成 `/items` 打到当前源上 */
const assertBaseUrl = (baseUrl: string): void => {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    throw new HttpConfigError('HTTP adapter config "baseUrl" must be a non-empty string', 'baseUrl', baseUrl);
  }
};

/**
 * 两个必选 handler 缺一不可。
 *
 * @remarks
 * 它们是 `RxDBAdapterRemoteBase` 两个 abstract 成员的落地点，缺了整条 QueryCache 读路径
 * 都不成立。拖到首次查询才报，等于让一个「连得上」的库带着注定失败的实体跑到运行期。
 */
const assertRequiredHandlers = (handlers: { onFetchMetadata?: unknown; onFindByIds?: unknown } | undefined): void => {
  for (const required of ['onFetchMetadata', 'onFindByIds'] as const) {
    if (handlers?.[required]) {
      continue;
    }
    throw new HttpConfigError(
      `HTTP adapter config "handlers.${required}" is required`,
      `handlers.${required}`,
      handlers?.[required]
    );
  }
};

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterHttp;
  }
}

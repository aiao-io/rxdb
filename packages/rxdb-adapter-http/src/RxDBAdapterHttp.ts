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
  getSyncType,
  isSystemEntity,
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
import { assertChangeFeedUrl, HttpChangeFeed, type ChangeFeedEntity } from './change-feed.js';
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
  /** 变更通知通道；未配 `changeFeed` 时**不存在**（US-023 AC#12：缺席即关闭） */
  readonly #changeFeed: HttpChangeFeed | undefined;

  /**
   * 通道该不该跑的**意图**位，与「通道存不存在」是两件事。
   *
   * @remarks
   * 配了就默认为 `true`——`changeFeed` 这个配置项本身就是「我要收通知」的表达，
   * 让它配完还得再调一次 `startChangeFeed()` 才生效，是给每个接入方加一道无意义的手续。
   */
  #changeFeedEnabled: boolean;

  /**
   * `connect()` 是否成功走完过一遍，且此后没有 `disconnect()`。
   *
   * @remarks
   * 与 `#disconnected.signal.aborted` 是两个问题：那一位答的是「有没有被断开过」，
   * 刚 `new` 出来的适配器上它是 `false`——于是「从未连接」和「连接正常」在它眼里一模一样。
   * 开长连接必须分得清这两者，见 {@link RxDBAdapterHttp.startChangeFeed}。
   */
  #connected = false;

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
   * 变更通知通道此刻**要不要**跑，由 {@link RxDBAdapterHttp.startChangeFeed} /
   * {@link RxDBAdapterHttp.stopChangeFeed} 翻转。
   *
   * @returns 未配 `changeFeed` 时恒为 `false`
   *
   * @remarks
   * 这是**意图**，不是连接状态：通道正在退避重连、或所在运行时压根没有 `EventSource` 时，
   * 它照样是 `true`。想知道连接本身的死活，看 `changeFeed.onUnavailable` 的诊断上报——
   * `EventSource` 不暴露状态码，一个从这里返回的布尔值答不了「为什么没连上」，
   * 只会把两种问题混成一种。
   *
   * （夹在写 duck 与构造函数之间是 lint `member-ordering` 的要求：访问器排在字段之后、
   * 构造函数之前。语义上它属于下面那组运行时开关。）
   */
  get changeFeedEnabled(): boolean {
    return this.#changeFeedEnabled;
  }

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
    this.#changeFeed = this.#createChangeFeed();
    this.#changeFeedEnabled = this.#changeFeed !== undefined;
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
   * **配了 `changeFeed` 才有长连接**，且它建在最后：校验没过的 `connect()` 不该留下一条
   * 活着的通知连接。通道自身连不上不影响本方法的返回——它按 US-023 AC#17 只诊断不抛错。
   *
   * 通道走的是{@link RxDBAdapterHttp.changeFeedEnabled}这个**意图位**而不是「配了就开」：
   * 调用方手动 {@link RxDBAdapterHttp.stopChangeFeed} 掉的通道，不该被下一次重连
   * （切后端、纪元交替都会走到这里）悄悄复活。
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
    this.#connected = true;
    // start() 自带「先收口上一条」，重复 connect() 因此不会留下第二条连接
    if (this.#changeFeedEnabled) {
      this.#changeFeed?.start();
    }
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
   *
   * 变更通知通道一并停掉，**含待执行的重连**：只关连接不取消定时器的话，退避窗口里的那次
   * 重连会在断开之后把连接重新建起来。
   *
   * 但{@link RxDBAdapterHttp.changeFeedEnabled}**不动**：断开是生命周期事件，不是调用方
   * 改了主意。把它一并清掉的话，一次重连就会把用户「我要收通知」的选择吃掉。
   */
  async disconnect(): Promise<void> {
    this.#connected = false;
    this.#disconnected.abort();
    this.#transport.clearConditionalCache();
    this.#changeFeed?.stop();
    return Promise.resolve();
  }

  // ============================================
  // 变更通知的运行时开关
  // ============================================

  /**
   * 接通变更通知通道。
   *
   * @remarks
   * 幂等：已经开着时只是重建连接（`start()` 自带「先收口上一条」），不会留下第二条。
   * 连上之后照常触发一次全量失效（D7）——「从这一刻起我能收到变更了」对首次连接与
   * 重新接通是同一句话。
   *
   * **连接状态先判**，与 {@link RxDBAdapterHttp.version} 同一条口径：在一个已经
   * `disconnect()` 的适配器上开出一条活着的 SSE，是实打实的资源泄漏。
   *
   * 这里判的是 `#connected` 而不是 `#assertConnected` 那一位。**「从未 `connect()`」
   * 与「已 `disconnect()`」在这个方法上是同一件事**：两种情况下都还没有一次成功的
   * `connect()`，也就意味着 `#assertConfiguredEntitiesSupported()` 还没跑过——
   * 用 `new` + `startChangeFeed()` 就能绕开线格式校验、在一个连不连得上都不知道的
   * 适配器上开出真连接，还会对着一份尚未确认可用的实体表做 D7 全量失效。
   *
   * @throws HttpDisconnectedError 尚未 `connect()`，或已 `disconnect()`
   * @throws HttpUnsupportedOperationError 未配置 `changeFeed`
   */
  startChangeFeed(): void {
    if (!this.#connected) {
      throw new HttpDisconnectedError('startChangeFeed');
    }
    const feed = this.#requireChangeFeed('startChangeFeed');
    this.#changeFeedEnabled = true;
    feed.start();
  }

  /**
   * 断开变更通知通道，**含待执行的重连**。
   *
   * @remarks
   * 断开期间远端的变更没有人会补发，重新
   * {@link RxDBAdapterHttp.startChangeFeed} 时的那次全量失效才是补课的地方。
   *
   * 与 {@link RxDBAdapterHttp.startChangeFeed} 不同，本方法**不判断开状态**：已经
   * `disconnect()` 的适配器上通道本来就停着，两条路通向同一个终点，为此抛错只会让
   * 「关掉开关」这种收尾动作平白需要一个 try。幂等的停止不是兜底——它没有掩盖任何差异。
   *
   * @throws HttpUnsupportedOperationError 未配置 `changeFeed`
   */
  stopChangeFeed(): void {
    const feed = this.#requireChangeFeed('stopChangeFeed');
    this.#changeFeedEnabled = false;
    feed.stop();
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
      // local-first 的可达性判定源：每次真发出去的请求都把结局交回去，
      // 由 `isNetworkError` 一处定夺是不是离线。**现读 `this.rxdb`** 而不是构造期快照，
      // 与下面 changeFeed 的三个回调同一条口径
      reportResult: error => this.rxdb.reachability.report(error),
      // 缺席即禁用：AC#28 要求未启用时行为与阶段 A 逐字相同，
      // 传一个 `{ enabled: false }` 会让那句话依赖 transport 内部再判一次
      // 诊断回调挂在 `conditional` 里面而不是与它并列：条件请求关掉时整个对象就不存在，
      // 「关掉就不该触发」（US-215 AC#4）由结构保证，不靠触发点再判一次开关
      conditional:
        this.options.conditionalRequests === true ?
          {
            maxEntries: this.config.conditionalCacheSize,
            onEtagUnreadable: this.options.onEtagUnreadable
          }
        : undefined
    });
  }

  /**
   * 建通知通道，未配 `changeFeed` 时返回 `undefined`。
   *
   * @remarks
   * 与 `conditional` 同一条口径：缺席即禁用。返回一个「停用状态的通道」会让 AC#12
   * 的「零连接」依赖对象内部再判一次开关，而这里不存在这个对象。
   *
   * URL 借 transport 拼：`baseUrl` 的拼接规则只有一份，让通道自己再拼一遍，两处迟早分叉。
   * 三个回调都是**现读**而不是构造期快照——`clientId` 在登录后会被换掉，实体清单也可能
   * 在 `connect()` 之后才补齐。
   */
  #createChangeFeed(): HttpChangeFeed | undefined {
    const changeFeed = this.options.changeFeed;
    if (changeFeed === undefined) {
      return undefined;
    }
    assertChangeFeedUrl(changeFeed.url);
    return new HttpChangeFeed({
      url: this.#transport.resolveUrl({ url: changeFeed.url, method: 'GET' }),
      options: changeFeed,
      clientId: () => this.rxdb.context.clientId,
      entities: () => this.#subscribedEntities(),
      invalidate: (entity, namespace) => this.rxdb.invalidateRemoteEntity(entity, namespace)
    });
  }

  /**
   * 走本适配器 remote 槽位的实体，即 D7 口中的「已订阅实体」。
   *
   * @remarks
   * SSE 不按实体订阅——服务端广播它认识的全部实体。所以「已订阅」只能由本地配置定义：
   * 连接建立时该失效的，正是那些以本适配器为远端权威的实体。别的实体的行由别的路径维护，
   * 顺手失效它们是越界。
   */
  #subscribedEntities(): readonly ChangeFeedEntity[] {
    const entities: ChangeFeedEntity[] = [];
    const seen = new Set<string>();
    for (const EntityClass of this.rxdb.config.entities) {
      const metadata = getEntityMetadata(EntityClass);
      const key = entityKey(metadata.name, metadata.namespace);
      if (seen.has(key) || !this.#isSubscribed(EntityClass, metadata)) {
        continue;
      }
      seen.add(key);
      entities.push({ name: metadata.name, namespace: metadata.namespace });
    }
    return entities;
  }

  /**
   * 单个实体是否由本适配器充当远端权威。
   *
   * @param EntityClass - 实体类，用来判系统表
   * @param metadata - 该实体的元数据
   *
   * @remarks
   * 三个条件缺一不可，前两个各自堵住一种「跟着库级配置被顺带算进来」的实体：
   *
   * - **不是系统表**：`SchemaManager.init()` 往 `config.entities` 里补的四张表不带自己的
   *   `sync`，于是一律跟随库级配置。库级写 `type: QueryCache` 时它们会被判成 querycache，
   *   连后两个条件都拦不住——但它们是纯本地簿记，远端根本没有对应的资源。
   * - **确实是 QueryCache**：v1 只服务这一种同步类型（其余入口一律抛
   *   {@link HttpUnsupportedOperationError}）。库级 `type: None` + 两端俱全时，跟随全局的
   *   实体会被判成 `full`，那种实体的行不经本适配器，失效它没有任何查询在等。
   * - **remote 槽位指向本适配器**：同一个库里可以挂多个远端。
   *
   * 放任任何一类混进来的后果不是崩，是每次连接把 D7 的上报量放大若干倍，
   * 而多出来的每一次都无人认领——面板上的「触发重跑」计数会跟着一起说谎。
   */
  #isSubscribed(EntityClass: EntityType, metadata: EntityMetadata): boolean {
    if (isSystemEntity(EntityClass)) {
      return false;
    }
    const globalSync = this.rxdb.config.sync;
    return (
      getSyncType(metadata, globalSync) === 'querycache' &&
      getSyncConfig(metadata, globalSync)?.remote?.adapter === ADAPTER_NAME
    );
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

  /**
   * 取通道实例，未配 `changeFeed` 时抛错。
   *
   * @remarks
   * 与 `version()` 未配 `onVersion` 同一条判例：**配置缺失要吵**。静默 no-op 会让
   * 「开关点了没反应」变成一个没有任何线索的现象，而这两个方法的调用点通常正是
   * 一个用户看得见的开关。
   *
   * 这里也**不**走 `create` / `update` / `delete` 那种「缺席即不支持」的 `declare` 模式：
   * 那套是为 core 的 `if (!this.remoteAdapter.create)` 特性探测服务的，通道没有探测方，
   * 把方法做成可选只会让每个调用点多写一个 `?.`，而那个 `?.` 恰好就是静默 no-op。
   */
  #requireChangeFeed(operation: string): HttpChangeFeed {
    const feed = this.#changeFeed;
    if (!feed) {
      throw new HttpUnsupportedOperationError(
        operation,
        'no "changeFeed" is configured; there is no channel to switch on or off'
      );
    }
    return feed;
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

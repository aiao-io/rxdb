import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  getEntityMetadata,
  RxDB,
  RxDBMigration,
  RxDBPluginBase,
  type EntityLocalCreatedEvent,
  type EntityLocalRemovedEvent,
  type EntityLocalUpdatedEvent,
  type IRepository,
  type IRxDBPlugin,
  type Plugin
} from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { isObservable, type Observable } from 'rxjs';

import type { FtsField } from '@aiao/rxdb-adapter-sqlite-core';
import { assertSupportedAdapter } from './core/adapter-guard.js';
import { aggregateResults, type CollectionPartial } from './core/aggregator.js';
import { extractFtsPlanFromMetadata, ftsMigrationName, type FtsInstallPlan } from './core/fts5-installer.js';
import { installFtsForEntity, type MigrationRecordStore, type RuntimeSqlExecutor } from './core/fts5-runtime.js';
import { assertSearchNumericOptions } from './core/options-guard.js';
import { compile } from './core/query-compiler.js';
import type { RawFtsRow } from './core/result-mapper.js';
import { assertSearchableSchemaValid } from './core/schema-validator.js';
import { resolveSearchScope } from './core/scope-resolver.js';
import { createSearchEngine, type SearchEngine } from './core/search-engine.js';
import { createSearchHandle, type PerformSearch, type SearchPage } from './core/search-handle.js';
import {
  SearchError,
  type SearchHandle,
  type SearchOptions,
  type SearchPluginOptions,
  type SearchResult
} from './types.js';

type EntityChangeEvent = EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent;

/** 触发已注册 handle 静默重查的三路本地实体事件。 */
const ENTITY_EVENT_TYPES = [ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_UPDATE_EVENT, ENTITY_LOCAL_REMOVE_EVENT] as const;

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SNIPPET_LENGTH = 120;
/**
 * 首次 `loadMore()` 时一次性抓取的结果池大小（页数）。
 *
 * @remarks
 * page 0 仍只抓 `pageSize + 1`，**不翻页的用户零额外成本**；一旦真的翻页，
 * 就一次性把初始池抓满并缓存，池内后续页直接切片；触达边界时才扩容重取，
 * 避免原来每页重取全量的累计 O(N²·pageSize) 传输，同时保证深翻页不会被静默截断。
 */
const LOAD_MORE_POOL_PAGES = 10;

/** 把 `rawQuery` 返回的 columns/rows 形式转换为列名 → 值 的对象数组。 */
const mapRowsToFtsRows = (raw: { columns: readonly string[]; rows: readonly unknown[][] }): RawFtsRow[] => {
  const cols = raw.columns;
  const colCount = cols.length;
  const rowCount = raw.rows.length;
  const out = new Array<RawFtsRow>(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const row = raw.rows[i];
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < colCount; j++) obj[cols[j]] = row[j];
    out[i] = obj as unknown as RawFtsRow;
  }
  return out;
};

/** 单个 searchable entity 的运行时索引项。 */
interface SearchableEntry {
  readonly entity: string;
  readonly table: string;
  readonly sqlTable: string;
  readonly primaryKey: string;
  /** FTS 列名，按 entity metadata 顺序 */
  readonly fields: readonly string[];
  readonly fieldSpecs: readonly FtsField[];
}

/** 注册到插件的活动 handle，使 entity 事件可精确派发。 */
interface HandleRegistration {
  readonly scope: ReadonlySet<string>;
  readonly onChange: () => void;
}

/**
 * {@link RxDBPluginSearch.ready} 背后的一格 deferred，一个连接纪元一格。
 *
 * @remarks
 * `resolve` / `reject` 幂等：迟到的旧纪元结算不会覆盖已经落定的结果。
 */
interface ReadyDeferred {
  readonly promise: Promise<void>;
  /** 已经 resolve 或 reject 过。`install()` 靠它判断该续用还是换新一格。 */
  readonly settled: boolean;
  reject(error: unknown): void;
  resolve(): void;
}

/**
 * 建一格 `ready`。
 *
 * @remarks
 * 建出来就先挂一次空 `.catch()`：`ready` 是**可选**的等待点（安装失败另有 `connect()`
 * 这条出口），没人 await 它时 reject 会变成 `unhandledrejection` 打到全局。
 * 这个 catch 只负责标记「已处理」，返回的仍是原 promise，消费方 await 照样拿到 reject。
 */
const createReadyDeferred = (): ReadyDeferred => {
  let settled = false;
  let resolveFn!: () => void;
  let rejectFn!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  void promise.catch(() => undefined);
  return {
    promise,
    get settled() {
      return settled;
    },
    reject: (error: unknown) => {
      if (settled) return;
      settled = true;
      rejectFn(error);
    },
    resolve: () => {
      if (settled) return;
      settled = true;
      resolveFn();
    }
  };
};

/** 纪元被释放时给未结算的 `ready` 的终局错误。 */
const destroyedError = (): SearchError =>
  new SearchError(
    '[rxdb-plugin-search] plugin is destroyed — the connection epoch that installed it was released; await db.connect() again'
  );

/**
 * `@aiao/rxdb-plugin-search` 主类。
 *
 * 职责：
 *  - `createRxDatabase` 阶段校验 adapter（fail-fast）
 *  - `install()` 阶段安装 FTS5 + backfill + 缓存 searchable 索引（时机由宿主按
 *    {@link RxDBPluginSearch.inject} 决定，插件自己不等依赖）
 *  - 在 {@link RxDB} 上挂载 `search` / `searchCollection` 入口
 *  - 订阅 `ENTITY_LOCAL_CREATE/UPDATE/REMOVE_EVENT` 向注册的 handle 派发静默重查
 *
 * @public
 */
export class RxDBPluginSearch extends RxDBPluginBase implements IRxDBPlugin {
  #installFailure?: { readonly error: unknown };
  #readyDeferred: ReadyDeferred = createReadyDeferred();
  /**
   * 本纪元的安装作用域；`undefined` 表示当前没有装着的纪元。
   *
   * @remarks
   * 它同时是纪元身份与纪元状态：`scope.state` 三态由宿主维护，插件不再自己记一个
   * 单调递增的号。迟到的旧纪元靠 `this.#scope !== scope` 认出自己已经过期。
   */
  #scope?: LifecycleScope;
  readonly #searchPlans: FtsInstallPlan[] = [];
  /** 表名 → 运行时可搜索条目。 `install()` 填充，`search()` 使用。 */
  readonly #searchEntries = new Map<string, SearchableEntry>();
  /** 实体名 → 表名，用于 entity 事件 → scope 过滤 */
  readonly #entityNameToTable = new Map<string, string>();
  /** 活动 handle 列表，entity 事件派发时遍历。 */
  readonly #handleRegistrations = new Set<HandleRegistration>();
  #engine?: SearchEngine;

  /**
   * 本地适配器就绪之后才安装。
   *
   * @remarks
   * 声明之前这段等待写在插件自己身上：`#runInstall()` 先 `rxdb.connect(localAdapterName)`
   * 再 `firstValueFrom(adapterConnected$)`，而 `RxDB.connect()` 又在等插件安装完成——
   * 两边互等，只靠「`adapterConnected$` 必须早于插件安装置位」这条时序约定绕开死锁。
   * 交给宿主之后，`install()` 被调用即代表引导链（迁移、建表、索引）已经跑完，
   * 直接 {@link RxDB.localAdapterSync} 取实例即可。
   */
  readonly inject = ['adapter:local'] as const;
  /**
   * 拆卸完全交给作用域。
   *
   * @remarks
   * 原来的 `SearchPluginPhase` 状态机已经没有了：`installing` / `failed` 由宿主调度器
   * 记账，`destroyed` 由 `scope.state` 表达。缓存复位从 `destroy()` 挪进作用域的一条
   * 撤销条目（`search:state`），于是「先释放作用域、再补一次 `destroy()`」的两步拆卸
   * 收敛成一步。
   */
  readonly lifecycle = 'scoped' as const;
  readonly name: Uncapitalize<string> = 'search';
  /** 插件级默认项（页大小、防抖、snippet、排除 collection） */
  readonly options: SearchPluginOptions;

  /**
   * 当 FTS5 安装完成时 resolve；若失败则 reject，便于宿主应用在关键路径等待并处理
   * {@link SearchSchemaMismatchError} 等致命错误。插件不擅自记录日志；宿主通过显式
   * `await` 此 promise 决定错误展示与遥测策略。
   *
   * @remarks
   * 一个连接纪元一格 deferred，各态如下：
   *
   * | 时机                          | `ready`                       |
   * | ----------------------------- | ----------------------------- |
   * | `connect()` 之前 / 依赖未就绪 | **pending**                   |
   * | 安装中                        | pending                       |
   * | 安装成功                      | resolve                       |
   * | 安装失败                      | reject（原始安装错误）        |
   * | 作用域被释放（断连 / 回滚）   | reject（`destroyed`）         |
   *
   * 「未安装先 reject」的老口径被 pending 取代是有意的：依赖调度落地之后，
   * 「还没轮到装」与「装不起来」不再是同一件事，前者只是还没到时候。老口径下
   * `await connect()` 与 `await ready` 之间存在一个竞态窗口——`connect()` 在飞时
   * `ready` 已经 reject，调用方拿到的错误与真实原因无关。
   *
   * 返回的 promise 逐纪元更换。跨断连持有同一个引用读到的是**那一纪元**的结果，
   * 重连之后要重新读一次 `ready`。
   */
  public get ready(): Promise<void> {
    return this.#readyDeferred.promise;
  }

  constructor(rxdb: RxDB, options?: SearchPluginOptions) {
    // 插件级默认值在这里挡一次：非法值往下传会直接进 SQL 的 LIMIT / snippet 长度（SRCH-006）
    assertSearchNumericOptions('rxDBPluginSearch options', options);
    super(rxdb);
    this.options = options ?? {};
    // Fail-fast：在 createRxDatabase 阶段即校验 adapter；不支持则直接 throw，不挂载 `.search`
    assertSupportedAdapter(rxdb?.config?.sync?.local?.adapter);
  }

  install(scope: LifecycleScope): Promise<void> {
    this.#installFailure = undefined;
    // 上一纪元结算过就换新一格；还 pending（首次安装，或依赖迟迟不就绪）则续用同一格，
    // 这样 `connect()` 之前就拿到 `ready` 引用的调用方不必重新读一次
    if (this.#readyDeferred.settled) this.#readyDeferred = createReadyDeferred();
    const deferred = this.#readyDeferred;
    // 先于任何 `acquire()`：非法的 `searchable` 声明在这里同步抛出，作用域一条登记都不留。
    // 同步抛出绕开了下面那条 `.then` 的失败分支，`ready` 于是没人结算——而作用域里一条
    // 登记都没有，宿主释放它时也补不上（`#teardown` 从来没挂上去）。不显式结算的话
    // `await ready` 会永久挂起，调用方看不出与「还没轮到装」的区别。
    //
    // 不走 `#failInstall`：那条路按 `#scope` 身份守卫，而此刻 `#scope` 还没换成本次的
    // 作用域，状态改写会被守卫整段跳过。这里要落地的恰好只有两件事——归因与结算。
    // `#primeSearchEntries` 开头就清空了三张表且抛点在填充之前，没有半成品需要回收。
    try {
      this.#primeSearchEntries();
    } catch (error) {
      this.#installFailure = { error };
      deferred.reject(error);
      throw error;
    }
    this.#scope = scope;
    // 复位条目最先登记 ⇒ 逆序释放时最后执行：排在它前面的撤销条目（entity 监听）
    // 跑的时候读到的仍是本纪元完整的缓存
    scope.acquire(() => () => this.#teardown(scope), 'search:state');
    // entity 事件通道在同步阶段就挂载：保证用户在 `await ready` 之前调用 `db.search()`
    // 也能立即接到数据变更（避免 install 失败 / 慢 install 期间 silent miss）。
    // 解绑不再由本插件记账——安装失败时宿主会释放 scope，正常拆卸时同样如此。
    this.#bindEntityEvents(scope);
    return this.#runInstall(scope).then(
      () => deferred.resolve(),
      (error: unknown) => {
        this.#failInstall(scope, deferred, error);
        throw error;
      }
    );
  }

  /**
   * 跨 collection 聚合搜索入口。
   *
   * `query` 可以是字符串（一次性查询）或 `Observable<string>`（对接输入流，自带防抖）。
   * `SearchOptions.collections` 用于进一步收窄范围（接受实体名或表名）；
   * 包含未知名称或与插件级 `excludedCollections` 求交后为空时抛错（fail-fast）。
   *
   * @throws 插件未安装（`db.connect()` 之前）或作用域已释放时抛错——与
   * {@link searchCollection} 对称。**不会**降级成空结果句柄，见 `#assertInstalled`。
   * @throws `install()` 失败时抛出原始安装错误。
   * @public
   */
  search(query: string | Observable<string>, options?: SearchOptions): SearchHandle {
    this.#throwInstallFailure();
    this.#assertInstalled();
    const candidates = [...this.#searchEntries.keys()];
    // 与 searchCollection 对称：实体名先归一化为表名，再参与 scope 解析
    const requested = options?.collections?.map(c => this.#entityNameToTable.get(c) ?? c);
    const scope = resolveSearchScope({
      candidates,
      excludedCollections: this.options.excludedCollections,
      requested
    });
    return this.#createAggregateHandle(scope, query, options);
  }

  /**
   * 限定单个 collection（按实体名或表名）的搜索入口。
   *
   * 若给定 collection 未被索引（无 `searchable` 字段）或被 `excludedCollections` 排除，抛错；
   * 宿主应在调用前通过 {@link RxDBPluginSearch.ready} 确认安装完成。
   *
   * @throws 插件未安装（`db.connect()` 之前）或作用域已释放时抛错——与 {@link search} 对称。
   * 该守卫先于「不可搜索」判断，避免把「插件没装」误报成「这个 collection 不可搜索」。
   * @throws `install()` 失败时抛出原始安装错误。
   * @public
   */
  searchCollection(collection: string, query: string | Observable<string>, options?: SearchOptions): SearchHandle {
    this.#throwInstallFailure();
    this.#assertInstalled();
    const table = this.#entityNameToTable.get(collection) ?? collection;
    const excl = this.options.excludedCollections;
    if (excl?.length && (excl.includes(table) || excl.includes(collection))) {
      throw new Error(`[rxdb-plugin-search] collection "${collection}" is excluded via excludedCollections option`);
    }
    if (!this.#searchEntries.has(table)) {
      throw new Error(
        `[rxdb-plugin-search] collection "${collection}" is not searchable — no entity registered with this name, or none of its properties declare \`searchable: true\``
      );
    }
    return this.#createAggregateHandle([table], query, options);
  }

  /**
   * 直接以注入 `performSearch` 的方式创建 {@link SearchHandle}。
   *
   * 供框架绑定层与集成测试使用（便于 mock 执行器）；生产路径请使用 {@link search} /
   * {@link searchCollection}。
   *
   * @param performSearch - 真实查询执行函数；入参是归一化后的查询词与页号
   * @param options - 单次调用级覆盖（debounce / initialQuery）
   * @public
   */
  createHandle(performSearch: PerformSearch, options?: SearchOptions): SearchHandle {
    assertSearchNumericOptions('SearchOptions', options);
    return createSearchHandle({
      performSearch,
      debounceMs: options?.debounce ?? this.options.debounce ?? 300,
      initialQuery: options?.initialQuery
    });
  }

  #createAggregateHandle(
    scope: readonly string[],
    query: string | Observable<string>,
    options?: SearchOptions
  ): SearchHandle {
    assertSearchNumericOptions('SearchOptions', options);
    const pageSize = options?.pageSize ?? this.options.pageSize ?? DEFAULT_PAGE_SIZE;
    const snippetLength = options?.snippetLength ?? this.options.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
    const debounceMs = options?.debounce ?? this.options.debounce;
    const initialQuery = typeof query === 'string' ? (options?.initialQuery ?? query) : options?.initialQuery;

    const performSearch = this.#buildPerformSearch(scope, pageSize, snippetLength);
    const scopeSet = new Set(scope);
    const inner = createSearchHandle({
      performSearch,
      isSearchableQuery: candidate => compile(candidate) !== null,
      debounceMs,
      initialQuery,
      querySource: isObservable(query) ? query : undefined,
      subscribeDataChanges: onChange => {
        const reg: HandleRegistration = { scope: scopeSet, onChange };
        this.#handleRegistrations.add(reg);
        return () => {
          this.#handleRegistrations.delete(reg);
        };
      }
    });

    return inner;
  }

  /** 组装 {@link PerformSearch}：query → compile → per-collection engine → aggregate → slice */
  #buildPerformSearch(scope: readonly string[], pageSize: number, snippetLength: number): PerformSearch {
    // 在闭包外缓存有效 entries 列表：scope 不变，每次查询无需再用 table 查 Map
    const scopedEntries = scope.map(table => this.#searchEntries.get(table)).filter((e): e is SearchableEntry => !!e);
    // 惰性结果池：首次 loadMore 抓满一次后缓存，后续页切片，不再每页重取全量
    let pool: { match: string; results: readonly SearchResult[]; hasMore: boolean } | null = null;
    return async (query: string, page: number, signal?: AbortSignal): Promise<SearchPage> => {
      signal?.throwIfAborted();
      const compiled = compile(query);
      if (!compiled || scopedEntries.length === 0) {
        return { results: [], hasMore: false };
      }
      const engine = this.#engine;
      if (!engine) {
        throw new Error(
          '[rxdb-plugin-search] search engine is not ready. await `(db.plugins.get("search") as RxDBPluginSearch).ready` before issuing queries.'
        );
      }
      const offset = page * pageSize;
      // page 0 永远重取：数据变更走的正是 page 0 重查这条路，缓存必须让位于新鲜度
      const cached = page > 0 && pool?.match === compiled.match ? pool : null;
      if (cached) {
        if (!cached.hasMore || offset + pageSize < cached.results.length) {
          return {
            results: cached.results.slice(offset, offset + pageSize),
            hasMore: cached.hasMore || cached.results.length > offset + pageSize
          };
        }
      }

      // page 0 只抓一页多一条；首次翻页抓十页，后续触达池边界时指数扩容。
      const poolCap =
        page === 0 ? pageSize
        : cached ? Math.max(cached.results.length * 2, offset + pageSize)
        : pageSize * LOAD_MORE_POOL_PAGES;

      // 每个 collection 都多抓 1 条：单 collection 场景下 hasMore 完全依赖这一条溢出，
      // 不能只靠跨 collection 合并凑数（否则单表分页 hasMore 恒为 false）。
      const parts: CollectionPartial[] = await Promise.all(
        scopedEntries.map(async entry => ({
          collection: entry.table,
          results: await engine.search({
            table: entry.table,
            sqlTable: entry.sqlTable,
            entity: entry.entity,
            primaryKey: entry.primaryKey,
            fields: entry.fields,
            fieldSpecs: entry.fieldSpecs,
            compiled,
            pageSize: poolCap + 1,
            offset: 0,
            snippetLength
          })
        }))
      );
      signal?.throwIfAborted();
      const fetched = aggregateResults(parts, { pageSize: poolCap + 1 });
      const poolHasMore = page > 0 && fetched.length === poolCap + 1;
      // page 0 的池只有一页，缓存它没有意义；只有翻页抓来的整池才值得留
      pool = page === 0 ? null : { match: compiled.match, results: fetched, hasMore: poolHasMore };
      return {
        results: fetched.slice(offset, offset + pageSize),
        hasMore: poolHasMore || fetched.length > offset + pageSize
      };
    };
  }

  /**
   * 真实安装流程。
   *
   * @param scope - 本轮安装的作用域，同时充当纪元身份
   *
   * @remarks
   * 这里**不再**等任何东西。`inject: ['adapter:local']` 之后，被调用即代表本地适配器
   * 的引导链已经跑完；原来的 `connect()` 自触发 + `adapterConnected$` + `localAdapter$`
   * 三段等待整体交给了宿主调度器。
   *
   * `localAdapterSync` 而不是 `localAdapter$`：后者按名字重新解析，可能给回**另一个**
   * 实例（重连之后工厂会新建一个），而调度器的纪元绑的是当下这一个。
   */
  async #runInstall(scope: LifecycleScope): Promise<void> {
    const adapter = this.rxdb.localAdapterSync;
    if (!adapter.rawQuery) {
      throw new Error(
        '[rxdb-plugin-search] active adapter does not implement rawQuery; search requires a SQLite-compatible adapter'
      );
    }
    const rawQuery = adapter.rawQuery.bind(adapter);
    // 防御性复制 params：部分 adapter 实现可能在内部修改入参数组，避免与上游共享引用
    const callRaw = (sql: string, params?: readonly unknown[]) => rawQuery(sql, params ? [...params] : undefined);

    // FTS DDL / 迁移仓必须走 bootstrapTransaction：此时适配器已就绪，
    // 但 RxDB.connect() 还卡在 #await_plugin_installs。adapter.rawQuery / repo.find
    // 都会 ready() → 再等 connect()，等于等自己。
    //
    // 第二个参数 false 关掉事务日志：这里全是 DDL 和迁移水位线，不是用户变更。
    // 开着的话每个事务都会白白读一次分支号、重建一遍所有受日志实体的触发器。
    //
    // 每个实体**各自**一个事务，不合并成一个大事务：合并后任意一个实体撞上
    // RxDBMigrationClaimConflictError（另一个 tab 正在装同一张表），会把已经装好的
    // 其它实体一起回滚。逐个提交时冲突只影响它自己。
    for (const plan of this.#searchPlans) {
      // 每一轮之前都验纪元。**不能**只在循环之后验一次：那种写法的理由是「DDL 全打在捕获的
      // 那个适配器上，纪元换了它自己会失败」，而这个理由只在旧纪元握着的是一条**死**连接时
      // 才成立。宿主的重连是「先释放旧作用域、再以新实例重装」，两轮之间连接一直活着，
      // 于是同一批 FTS DDL 会在活库上原样重跑一遍。
      //
      // 中途收手不留半成品：`installFtsForEntity` 幂等，剩下的 plan 由新纪元那一轮从头装完。
      if (scope.state !== 'active') return;
      await adapter.bootstrapTransaction(async tx => {
        const executor: RuntimeSqlExecutor = {
          rawQuery: (sql, params?) => tx.query(sql, params ? [...params] : undefined)
        };
        await installFtsForEntity(plan, executor, this.#createMigrationStore(tx.getRepository(RxDBMigration)));
      }, false);
    }

    // 末轮 DDL 之后仍要再验一次：`callRaw` 闭包绑死了本轮的适配器，
    // 而 `#refreshRegisteredHandles()` 唤醒的却是新纪元的 handle。
    if (scope.state !== 'active') return;

    this.#engine = createSearchEngine(async (sql, params) => mapRowsToFtsRows(await callRaw(sql, params)));

    // entity 事件通道已在 install() 同步阶段绑定；FTS 落库后唤醒已注册 handle 重新查询
    this.#refreshRegisteredHandles();
  }

  /**
   * 按当前 `config.entities` 重扫可搜索字段，整体覆盖三张表。
   *
   * @remarks
   * 每次 `install()` 都重扫，而不是「已有 plan 就跳过」：`entities` 是
   * `LIVE_BEHAVIOUR_CONFIG_KEYS` 里的字段，宿主有意不深冻结它。正常重连路径上作用域
   * 释放已经清空过 plan，重扫本来就会发生；跳过只在「`init()` 抛错回滚后同步重试」
   * 这一条抢在旧作用域释放之前重装的路上生效——那正是最不该复用上一轮快照的地方。
   * 扫描是纯内存的元数据遍历，一个纪元一次，代价可忽略。
   */
  #primeSearchEntries(): void {
    this.#searchPlans.length = 0;
    this.#searchEntries.clear();
    this.#entityNameToTable.clear();

    const excludedSrc = this.options.excludedCollections;
    const excluded = excludedSrc?.length ? new Set(excludedSrc) : null;
    const allMetadata = this.rxdb.config.entities.map(EntityType => getEntityMetadata(EntityType));
    // Fail-fast：扫描所有标注 `searchable: true` 的字段，类型不在白名单（string/enum/stringArray）则抛错。
    // 否则非法字段会被 extractFtsPlanFromMetadata 静默过滤，开发者难以察觉。
    assertSearchableSchemaValid(allMetadata);

    for (const metadata of allMetadata) {
      if (excluded && (excluded.has(metadata.tableName) || excluded.has(metadata.name))) continue;

      const plan = extractFtsPlanFromMetadata(metadata);
      if (!plan) continue;

      this.#searchPlans.push(plan);
      this.#searchEntries.set(plan.tableName, {
        entity: metadata.name,
        table: plan.tableName,
        sqlTable: plan.sqlTableName ?? plan.tableName,
        primaryKey: plan.primaryKey,
        fields: plan.fields.map(f => f.name),
        fieldSpecs: plan.fields
      });
      this.#entityNameToTable.set(metadata.name, plan.tableName);
    }
  }

  #refreshRegisteredHandles(): void {
    if (this.#handleRegistrations.size === 0) return;
    for (const reg of this.#handleRegistrations) {
      reg.onChange();
    }
  }

  /**
   * 记录安装失败并结算本纪元的 `ready`。
   *
   * @param scope - 失败的那一轮安装的作用域
   * @param deferred - 那一轮的 `ready`
   * @param error - 原始安装错误
   *
   * @remarks
   * 身份守卫只挡**状态写入**，错误照样透传给 `install()` 的调用方——宿主要靠它把失败
   * 传播到 `connect()`，而旧纪元的失败不该把新纪元刚建好的 engine 和 handle 清掉。
   */
  #failInstall(scope: LifecycleScope, deferred: ReadyDeferred, error: unknown): void {
    deferred.reject(error);
    if (this.#scope !== scope) return;
    this.#installFailure = { error };
    this.#handleRegistrations.clear();
    this.#engine = undefined;
  }

  /**
   * 纪元结束：结算 `ready` 并复位各级缓存。
   *
   * @param scope - 正在释放的作用域
   *
   * @remarks
   * 这里是原来的 `destroy()`。挂到作用域上之后，宿主释放完就收手（`lifecycle: 'scoped'`），
   * 不再有「先释放作用域、再补一次 `destroy()`」的两步拆卸。
   *
   * 旧纪元迟到的释放直接返回，`ready` 一格都不碰：`#readyDeferred` 只在结算之后才换新一格
   * （见 `install()`），所以「还 pending 的那一格」必定就是当前这一格，动它等于替新纪元
   * 认输；而旧纪元自己那一格既然已经结算，也没有什么可结算的了。
   *
   * `#installFailure` **不**复位：作用域释放之后 `search()` 抛「安装为什么失败」比抛
   * 「插件没装」更有归因价值，而下一次 `install()` 起手就会把它清掉，脏值不会跨纪元。
   */
  #teardown(scope: LifecycleScope): void {
    if (this.#scope !== scope) return;
    // 已经结算过的那一格改不动了，换一格 rejected 的顶上：纪元结束之后 `search()` 一定抛，
    // `ready` 就不能还留着上一纪元的 resolve 骗调用方「可以搜了」。
    // 失败纪元同理换掉——原始安装错误由 `#installFailure` 留在 `search()` 那条路上归因
    if (this.#readyDeferred.settled) this.#readyDeferred = createReadyDeferred();
    this.#readyDeferred.reject(destroyedError());
    this.#scope = undefined;
    this.#handleRegistrations.clear();
    this.#searchEntries.clear();
    this.#entityNameToTable.clear();
    this.#searchPlans.length = 0;
    this.#engine = undefined;
  }

  #throwInstallFailure(): void {
    const failure = this.#installFailure;
    if (failure) throw failure.error;
  }

  /**
   * 未安装（含 `install()` 之前与作用域释放之后）时硬失败。
   *
   * 必须在 {@link search} / {@link searchCollection} **两个**入口上对称调用：
   * 未安装时 `#searchEntries` 为空，`search()` 会解析出空 scope 并让
   * `#buildPerformSearch` 直接返回 `{ results: [], hasMore: false }` —— 而 scope 在创建
   * handle 时就被闭包冻结，后续 `install()` 完成也**不会自愈**。即「搜不到」与「插件没装」
   * 无法区分，且永久静默。这违反「无 fallback 兜底」，故在入口处硬失败。
   *
   * 触发窗口真实存在：`RxDB#use()` 在注册时就把 `.search` 挂到实例上，而 `install()`
   * 要等到本地适配器就绪才跑。
   *
   * 判据是作用域的 `active` 而不是「安装完了没有」：安装中允许 `search()`（entity 事件
   * 与 `#searchEntries` 在同步阶段就位，`#buildPerformSearch` 会因 `#engine` 未就绪
   * 明确抛错），而作用域一旦释放就必须硬失败。
   */
  #assertInstalled(): void {
    if (this.#scope?.state === 'active') return;
    throw new Error(
      '[rxdb-plugin-search] plugin is not installed — await `db.connect()` before `db.search()` / `db.searchCollection()`, and do not search after the connection epoch is released'
    );
  }

  /**
   * 把三路 entity 事件监听挂到作用域上。
   *
   * @param scope - 本次安装的作用域
   *
   * @remarks
   * 一条监听一条 `acquire()`，不合成一条：合成时第二条 `addEventListener()` 抛错会让整个
   * setup 失败，作用域于是一条撤销条目都没登记，而第一条监听已经挂在宿主上了——没有任何
   * 路径能再把它摘下来。
   */
  #bindEntityEvents(scope: LifecycleScope): void {
    const dispatch = (event: EntityChangeEvent) => {
      if (this.#handleRegistrations.size === 0) return;
      const changedTables = new Set<string>();
      for (const e of event.entities) {
        const table = this.#entityNameToTable.get(e.entity);
        if (table) changedTables.add(table);
      }
      if (changedTables.size === 0) return;
      // 让小集合驱动外层循环，最大化命中即跳出的概率
      for (const reg of this.#handleRegistrations) {
        const [outer, inner] =
          reg.scope.size <= changedTables.size ? [reg.scope, changedTables] : [changedTables, reg.scope];
        for (const t of outer) {
          if (inner.has(t)) {
            reg.onChange();
            break;
          }
        }
      }
    };
    for (const type of ENTITY_EVENT_TYPES) {
      scope.acquire(() => {
        this.rxdb.addEventListener(type, dispatch as never);
        return () => this.rxdb.removeEventListener(type as never, dispatch as never);
      }, `search:entityEvents:${type}`);
    }
  }

  #createMigrationStore(repo: Pick<IRepository<typeof RxDBMigration>, 'find' | 'create'>): MigrationRecordStore {
    return {
      async listInstallMigrationsForTable(tableName: string) {
        const prefix = `${ftsMigrationName(tableName, 'install')}__`;
        // 前缀过滤下推到查询：迁移表只增不减，安装期每张表全表扫一遍不可接受。
        const records = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'name', operator: 'startsWith', value: prefix }] }
        });
        // 仍需 JS 侧精确复核：`startsWith` 被编译成不带 ESCAPE 的 `LIKE 'prefix%'`，
        // 而前缀里的 `_` 在 LIKE 语义下是「任意单字符」通配符，SQL 侧只是宽松预筛。
        // 放行别表记录的后果不是多返回几条——`installFtsForEntity` 会把它当成本表的
        // 历史签名并抛 SearchSchemaMismatchError，安装直接被误杀。
        return records.filter(r => r.name.startsWith(prefix)).map(r => ({ name: r.name }));
      },
      async recordMigration(name: string) {
        const record = Object.create(RxDBMigration.prototype) as RxDBMigration;
        record.name = name;
        record.executedAt = new Date();
        await repo.create(record);
      }
    };
  }
}

/**
 * 通过模块增广把 `search` / `searchCollection` 挂到 {@link RxDB} 实例。
 *
 * 与 `rxDBPluginTrigger` 的做法一致：通过 factory 在插件实例化时绑定方法，
 * 并用 `declare module` 在类型层告知消费方。
 */
declare module '@aiao/rxdb' {
  interface RxDB {
    /** 已安装的搜索插件实例；用其 `ready` 等待 FTS 初始化。 */
    readonly searchPlugin: RxDBPluginSearch;
    /** 跨 collection 聚合搜索（由 `@aiao/rxdb-plugin-search` 挂载） */
    search(query: string | Observable<string>, options?: SearchOptions): SearchHandle;
    /** 单 collection 搜索（按实体名或表名） */
    searchCollection(collection: string, query: string | Observable<string>, options?: SearchOptions): SearchHandle;
  }
}

/**
 * 插件工厂；与 `rxDBPluginTrigger` 等同形态。
 *
 * @example
 * ```ts
 * db.use(rxDBPluginSearch, { debounce: 200 });
 * await db.connect('sqlite-wasm');
 * await db.searchPlugin.ready;
 * const handle = db.search('foo bar');
 * ```
 *
 * @public
 */
export const rxDBPluginSearch: Plugin<SearchPluginOptions> = (db, options) => {
  if (Object.prototype.hasOwnProperty.call(db, 'searchPlugin')) {
    const installed = Object.getOwnPropertyDescriptor(db, 'searchPlugin')?.value;
    if (installed instanceof RxDBPluginSearch) return installed;
    throw new Error('search plugin is already installed with an incompatible instance');
  }
  const plugin = new RxDBPluginSearch(db, options);
  type PatchedRxDB = RxDB & {
    readonly searchPlugin: RxDBPluginSearch;
    search: RxDBPluginSearch['search'];
    searchCollection: RxDBPluginSearch['searchCollection'];
  };
  const patched = db as PatchedRxDB;
  Object.defineProperty(patched, 'searchPlugin', {
    value: plugin,
    enumerable: false,
    configurable: false,
    writable: false
  });
  patched.search = plugin.search.bind(plugin);
  patched.searchCollection = plugin.searchCollection.bind(plugin);
  return plugin;
};

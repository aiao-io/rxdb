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
import { filter, firstValueFrom, isObservable, type Observable } from 'rxjs';

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

type SearchPluginPhase = 'created' | 'installing' | 'ready' | 'failed' | 'destroyed';

/**
 * `@aiao/rxdb-plugin-search` 主类。
 *
 * 职责：
 *  - `createRxDatabase` 阶段校验 adapter（fail-fast）
 *  - `install()` 阶段异步安装 FTS5 + backfill + 缓存 searchable 索引
 *  - 在 {@link RxDB} 上挂载 `search` / `searchCollection` 入口
 *  - 订阅 `ENTITY_LOCAL_CREATE/UPDATE/REMOVE_EVENT` 向注册的 handle 派发静默重查
 *
 * @public
 */
export class RxDBPluginSearch extends RxDBPluginBase implements IRxDBPlugin {
  #installPromise?: Promise<void>;
  #installFailure?: { readonly error: unknown };
  #phase: SearchPluginPhase = 'created';
  readonly #searchPlans: FtsInstallPlan[] = [];
  /** 表名 → 运行时可搜索条目。 `install()` 填充，`search()` 使用。 */
  readonly #searchEntries = new Map<string, SearchableEntry>();
  /** 实体名 → 表名，用于 entity 事件 → scope 过滤 */
  readonly #entityNameToTable = new Map<string, string>();
  /** 活动 handle 列表，entity 事件派发时遍历。 */
  readonly #handleRegistrations = new Set<HandleRegistration>();
  /** 便于 destroy() 时解除 addEventListener */
  readonly #entityEventListeners: Array<{ type: string; listener: (e: EntityChangeEvent) => void }> = [];
  #engine?: SearchEngine;

  readonly name: Uncapitalize<string> = 'search';
  /** 插件级默认项（页大小、防抖、snippet、排除 collection） */
  readonly options: SearchPluginOptions;

  /**
   * 当 FTS5 安装完成时 resolve；若失败则 reject，便于宿主应用在关键路径等待并处理
   * {@link SearchSchemaMismatchError} 等致命错误。插件不擅自记录日志；宿主通过显式
   * `await` 此 promise 决定错误展示与遥测策略。
   */
  public get ready(): Promise<void> {
    const installPromise = this.#installPromise;
    if (installPromise) return installPromise;
    const reason = this.#phase === 'destroyed' ? 'destroyed' : 'not installed';
    return Promise.reject(
      new SearchError(`[rxdb-plugin-search] plugin is ${reason} — call and await db.connect() before awaiting ready`)
    );
  }

  constructor(rxdb: RxDB, options?: SearchPluginOptions) {
    // 插件级默认值在这里挡一次：非法值往下传会直接进 SQL 的 LIMIT / snippet 长度（SRCH-006）
    assertSearchNumericOptions('rxDBPluginSearch options', options);
    super(rxdb);
    this.options = options ?? {};
    // Fail-fast：在 createRxDatabase 阶段即校验 adapter；不支持则直接 throw，不挂载 `.search`
    assertSupportedAdapter(rxdb?.config?.sync?.local?.adapter);
  }

  install(): Promise<void> {
    this.#installFailure = undefined;
    this.#primeSearchEntries();
    // entity 事件通道在同步阶段就挂载：保证用户在 `await ready` 之前调用 `db.search()`
    // 也能立即接到数据变更（避免 install 失败 / 慢 install 期间 silent miss）。
    this.#bindEntityEvents();
    // 立刻返回；真实安装在 adapter 可用后异步执行，结果通过 {@link ready} 暴露
    const installPromise = this.#runInstall()
      .then(() => {
        if (this.#installPromise === installPromise) this.#phase = 'ready';
      })
      .catch(error => {
        if (this.#installPromise !== installPromise) throw error;
        this.#phase = 'failed';
        this.#installFailure = { error };
        this.#unbindEntityEvents();
        this.#handleRegistrations.clear();
        this.#engine = undefined;
        throw error;
      });
    this.#phase = 'installing';
    this.#installPromise = installPromise;
    return installPromise;
  }

  destroy(): void {
    this.#phase = 'destroyed';
    this.#unbindEntityEvents();
    this.#handleRegistrations.clear();
    this.#searchEntries.clear();
    this.#entityNameToTable.clear();
    this.#searchPlans.length = 0;
    this.#engine = undefined;
    this.#installFailure = undefined;
    // 清空 install promise，避免 destroy 后 `await ready` 仍 resolve 而后续 search 抛 "engine not ready"
    this.#installPromise = undefined;
  }

  /**
   * 跨 collection 聚合搜索入口。
   *
   * `query` 可以是字符串（一次性查询）或 `Observable<string>`（对接输入流，自带防抖）。
   * `SearchOptions.collections` 用于进一步收窄范围（接受实体名或表名）；
   * 包含未知名称或与插件级 `excludedCollections` 求交后为空时抛错（fail-fast）。
   *
   * @throws 插件未安装（`db.init()` 之前）或已 `destroy()` 时抛错——与
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
   * @throws 插件未安装（`db.init()` 之前）或已 `destroy()` 时抛错——与 {@link search} 对称。
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

  async #runInstall(): Promise<void> {
    const localAdapterName = this.rxdb.config.sync?.local?.adapter;
    if (!localAdapterName) {
      throw new Error('[rxdb-plugin-search] local adapter is not configured; search requires a local SQLite adapter');
    }

    // 主表由 RxDB 在 connect() 流程中创建。不能 await connect() 本身：
    // connect() 会在 connected$ 之后再 await 插件 install，互相等待会死锁。
    const connecting = this.rxdb.connect(localAdapterName);
    await Promise.race([firstValueFrom(this.rxdb.connected$.pipe(filter(Boolean))), connecting]);

    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    if (!adapter.rawQuery) {
      throw new Error(
        '[rxdb-plugin-search] active adapter does not implement rawQuery; search requires a SQLite-compatible adapter'
      );
    }
    const rawQuery = adapter.rawQuery.bind(adapter);
    // 防御性复制 params：部分 adapter 实现可能在内部修改入参数组，避免与上游共享引用
    const callRaw = (sql: string, params?: readonly unknown[]) => rawQuery(sql, params ? [...params] : undefined);

    const executor: RuntimeSqlExecutor = { rawQuery: callRaw };
    const store = this.#createMigrationStore(adapter.getRepository(RxDBMigration));

    for (const plan of this.#searchPlans) {
      await installFtsForEntity(plan, executor, store);
    }

    this.#engine = createSearchEngine(async (sql, params) => mapRowsToFtsRows(await callRaw(sql, params)));

    // entity 事件通道已在 install() 同步阶段绑定；FTS 落库后唤醒已注册 handle 重新查询
    this.#refreshRegisteredHandles();
  }

  #primeSearchEntries(): void {
    if (this.#searchPlans.length > 0) return;

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

  #throwInstallFailure(): void {
    const failure = this.#installFailure;
    if (failure) throw failure.error;
  }

  /**
   * 未安装（含 `install()` 之前与 `destroy()` 之后）时硬失败。
   *
   * 必须在 {@link search} / {@link searchCollection} **两个**入口上对称调用：
   * 未安装时 `#searchEntries` 为空，`search()` 会解析出空 scope 并让
   * `#buildPerformSearch` 直接返回 `{ results: [], hasMore: false }` —— 而 scope 在创建
   * handle 时就被闭包冻结，后续 `install()` 完成也**不会自愈**。即「搜不到」与「插件没装」
   * 无法区分，且永久静默。这违反「无 fallback 兜底」，故在入口处硬失败。
   *
   * 触发窗口真实存在：`RxDB#use()` 在注册时就把 `.search` 挂到实例上，而 `install()`
   * 要等到 `RxDB#init()` 才跑。
   */
  #assertInstalled(): void {
    if (this.#installPromise) return;
    throw new Error(
      '[rxdb-plugin-search] plugin is not installed — call `db.init()` before `db.search()` / `db.searchCollection()`, and do not search after `destroy()`'
    );
  }

  #bindEntityEvents(): void {
    if (this.#entityEventListeners.length > 0) return;
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
    const types = [ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_UPDATE_EVENT, ENTITY_LOCAL_REMOVE_EVENT] as const;
    for (const type of types) {
      this.rxdb.addEventListener(type, dispatch as never);
      this.#entityEventListeners.push({ type, listener: dispatch });
    }
  }

  #unbindEntityEvents(): void {
    for (const { type, listener } of this.#entityEventListeners) {
      this.rxdb.removeEventListener(type as never, listener as never);
    }
    this.#entityEventListeners.length = 0;
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

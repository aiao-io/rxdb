import type { Observable } from 'rxjs';

/**
 * 单次搜索请求的可调参数；可覆盖 {@link SearchPluginOptions} 全局默认。
 *
 * @public
 */
export interface SearchOptions {
  /** 输入防抖窗口（ms）；默认 300，传 `0` 关闭防抖 */
  debounce?: number;
  /** 单页返回条数；默认 50 */
  pageSize?: number;
  /** 命中片段长度（字符数）；默认 120 */
  snippetLength?: number;
  /**
   * 限定参与聚合的 collection（接受实体名或表名）；默认聚合插件级排除规则之外的
   * 全部 searchable collection。包含未知名称或解析后范围为空时抛错（fail-fast）。
   */
  collections?: readonly string[];
  /** 订阅初次建立时立即执行的初始查询 */
  initialQuery?: string;
}

/**
 * `rxDBPluginSearch(options)` 的初始化选项。
 *
 * @public
 */
export interface SearchPluginOptions {
  /** 全局默认防抖（ms）；默认 300，被 {@link SearchOptions.debounce} 覆盖 */
  debounce?: number;
  /** 全局默认页大小；默认 50，被 {@link SearchOptions.pageSize} 覆盖 */
  pageSize?: number;
  /** 全局默认 snippet 长度；默认 120，被 {@link SearchOptions.snippetLength} 覆盖 */
  snippetLength?: number;
  /** 启用插件后全局排除的 collection 名称（即使字段标记 searchable 也不参与索引/查询） */
  excludedCollections?: readonly string[];
}

/**
 * `SearchHandle` 状态机五态。
 *
 * - `idle`    空查询（含 trim/转义后为空）
 * - `loading` 防抖中等待首次结果 / 静默重查 / `retry()`
 * - `success` 有结果
 * - `empty`   查询完成但无结果
 * - `error`   执行失败，保留最后一次查询词与结果
 *
 * 恢复成功的反馈通过框架绑定的 `aria-live` / toast 等呈现，**不引入第六种状态**。
 *
 * @public
 */
export type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/**
 * 单条搜索命中。
 *
 * @public
 */
export interface SearchResult {
  /** 命中记录所在实体名（如 `Article`、`Comment`） */
  entity: string;
  /** collection 表名 */
  collection: string;
  /** 记录主键（string 化） */
  id: string;
  /** BM25 rank，值越小越相关 */
  rank: number;
  /** 命中字段名 */
  matchedField: string;
  /** 从原文截取的可读摘要（无 HTML / Markdown 标记） */
  snippet: string;
}

/**
 * 由 `collection.search()` / `rxDB.search()` 返回的响应式句柄。
 *
 * 订阅 `results$` 即触发查询管道；调用 {@link SearchHandle.destroy} 释放所有内部订阅。
 * 框架绑定（Angular / React / Vue）会在生命周期末自动调用 `destroy()`。
 *
 * @public
 */
export interface SearchHandle {
  /** 响应式只读快照；数组与元素均在运行时冻结 */
  readonly results$: Observable<readonly Readonly<SearchResult>[]>;
  /** 当前状态（便于非框架场景读取） */
  readonly state$: Observable<SearchState>;
  /** 最近一次执行错误；空查询与归一化后为空不视为错误 */
  readonly error$: Observable<SearchExecutionError | undefined>;
  /** 是否还有下一页结果可加载 */
  readonly hasMore$: Observable<boolean>;
  /** 更新查询词（触发防抖） */
  setQuery(query: string): void;
  /** 加载下一页；无更多数据时 no-op */
  loadMore(): Promise<void>;
  /** 清空查询词，回到 `idle`，清空 results / error / pagination */
  clear(): void;
  /** 在 `error` 状态下以最后一次查询词重新触发 */
  retry(): void;
  /** 取消订阅并释放资源（框架层自动调用） */
  destroy(): void;
}

/**
 * 暴露 `search()` 方法的最小数据源形状（`RxDB` / `RxCollection`）。
 *
 * 三端绑定层（Angular / React / Vue）共用此约束，避免重复声明导致漂移。
 * `query` 仅接受 `string`：Observable 输入由调用方在 source 内部桥接。
 *
 * @public
 */
export interface SearchSourceLike {
  search(query: string, options?: SearchOptions): SearchHandle;
}

/**
 * `@aiao/rxdb-plugin-search` 错误基类。
 *
 * @public
 */
export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * FTS5 迁移签名与当前 schema 冲突；启动即抛，阻止挂载。
 *
 * 通常由开发者在已建索引的字段上修改 `searchable` 配置触发；首版需手动迁移。
 *
 * @public
 */
export class SearchSchemaMismatchError extends SearchError {
  constructor(
    /** 涉及表名 */
    public readonly table: string,
    /** 期望的字段签名（当前代码 schema 推导出的、希望落库的签名） */
    public readonly expected: string,
    /** 数据库中已存在的、与 expected 冲突的旧字段签名 */
    public readonly actual: string
  ) {
    super(`[rxdb-plugin-search] FTS5 schema mismatch on table "${table}": expected="${expected}", actual="${actual}"`);
  }
}

/**
 * 运行时执行错误（SQL 失败 / 存储不可用）；可通过 {@link SearchHandle.retry} 恢复。
 *
 * @public
 */
export class SearchExecutionError extends SearchError {
  constructor(
    message: string,
    /** 触发错误的原始异常 */
    public override readonly cause?: unknown
  ) {
    super(`[rxdb-plugin-search] ${message}`);
  }
}

/** 查询编译预算超限；不会执行 SQL，可通过 error$ 观察并由调用方提示用户缩短输入。 */
export type SearchQueryLimitKind = 'queryLength' | 'tokenCount' | 'tokenLength';

/** @public */
export class SearchQueryLimitError extends SearchExecutionError {
  constructor(
    public readonly kind: SearchQueryLimitKind,
    public readonly max: number,
    public readonly actual: number
  ) {
    super(`search query ${kind} exceeds maximum ${max} (actual ${actual})`);
  }
}

/**
 * 当前数据库使用了非 sqlite-wasm 的 adapter；在 `createRxDatabase` 阶段 fail-fast，
 * 插件不挂载 `.search`，不返回降级 Handle。
 *
 * @public
 */
export class SearchUnsupportedAdapterError extends SearchError {
  constructor(
    /** 实际探测到的 adapter 名 */
    public readonly adapter: string
  ) {
    super(
      `[rxdb-plugin-search] Unsupported adapter "${adapter}". Only @aiao/rxdb-adapter-sqlite-wasm is supported in this version.`
    );
  }
}

/**
 * 一个字段同时声明 `encrypted: true` 与 `searchable: true`。
 *
 * FTS5 只能索引明文，对密文列建立索引毫无意义。这是不可恢复的配置错误，
 * 在 `extractFtsPlanFromMetadata` 阶段 fail-fast。
 *
 * @public
 */
export class SearchEncryptedFieldError extends SearchError {
  constructor(
    /** 表名 */
    public readonly table: string,
    /** 字段名（列名） */
    public readonly column: string
  ) {
    super(
      `[rxdb-plugin-search] FTS cannot index encrypted column "${column}" on table "${table}". Remove either \`encrypted: true\` or \`searchable: true\` from this property.`
    );
  }
}

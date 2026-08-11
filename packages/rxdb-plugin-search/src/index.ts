/**
 * rxdb-plugin-search - RxDB 全局搜索插件
 *
 * 基于 SQLite FTS5 为标注 `searchable: true` 字段的 collection 提供响应式全文检索。
 *
 * @remarks
 * 仅兼容 `@aiao/rxdb-adapter-sqlite-wasm` 适配器；其他适配器将在数据库创建阶段 fail-fast。
 *
 * @packageDocumentation
 */

export type { FtsInstallPlan } from './core/fts5-installer.js';
export { buildBackfillSql, buildResetFtsSql, installFtsForEntity } from './core/fts5-runtime.js';
export type { InstallFtsResult, MigrationRecordStore, RuntimeSqlExecutor } from './core/fts5-runtime.js';
export { searchOptionsEqual } from './core/options-equality.js';
export { MAX_QUERY_LENGTH, MAX_QUERY_TOKENS, MAX_TOKEN_LENGTH } from './core/query-compiler.js';
export {
  SEARCHABLE_PROPERTY_TYPES,
  assertSearchableSchemaValid,
  collectInvalidSearchableFields
} from './core/schema-validator.js';
export type { InvalidSearchableField } from './core/schema-validator.js';
export { resolveSearchScope } from './core/scope-resolver.js';
export type { ResolveScopeInput } from './core/scope-resolver.js';
export {
  MAX_CONTAINS_FALLBACK_ROWS,
  buildFieldContainsSql,
  buildFieldMatchExpression,
  buildFieldSearchSql,
  buildSourceRowCountSql,
  createSearchEngine
} from './core/search-engine.js';
export type { FtsExecutor, SearchEngine, SearchEngineQuery } from './core/search-engine.js';
export { createSearchHandle } from './core/search-handle.js';
export type { CreateSearchHandleOptions, PerformSearch, SearchPage } from './core/search-handle.js';
export { createSearchState } from './core/search-state.js';
export type { SearchStateMachine, SearchStateSnapshot } from './core/search-state.js';
export { RxDBPluginSearch, rxDBPluginSearch } from './plugin.js';
export {
  SearchEncryptedFieldError,
  SearchError,
  SearchExecutionError,
  SearchQueryLimitError,
  SearchSchemaMismatchError,
  SearchUnsupportedAdapterError
} from './types.js';
export type {
  SearchHandle,
  SearchOptions,
  SearchPluginOptions,
  SearchQueryLimitKind,
  SearchResult,
  SearchSourceLike,
  SearchState
} from './types.js';

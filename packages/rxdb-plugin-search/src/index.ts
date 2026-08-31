/**
 * rxdb-plugin-search - RxDB 全局搜索插件
 *
 * 为标注 `searchable: true` 字段的 collection 提供响应式全文检索。
 *
 * @remarks
 * 具体的全文引擎由当前 adapter 决定，见 {@link SEARCH_BACKEND_DESCRIPTORS}：
 * SQLite 家族（`sqlite-wasm` / `sqlite` / `sqliteai`）走 FTS5 外部内容虚拟表，
 * `pglite` 走 PostgreSQL 物化 `tsvector` 列 + GIN 索引。
 * 未登记或登记为待实测的 adapter 会在数据库创建阶段 fail-fast，错误里带可判别的原因。
 *
 * @packageDocumentation
 */

export {
  SEARCH_BACKEND_DESCRIPTORS,
  createSearchBackend,
  lookupSearchBackendDescriptor,
  resolveSearchBackend
} from './backend/backend-registry.js';
export type { SearchBackendDescriptor, SearchBackendStatus } from './backend/backend-registry.js';
export { createFts5Backend } from './backend/fts5-backend.js';
export { createPgTsvectorBackend } from './backend/pg/pg-backend.js';
export { FULL_SEARCH_CAPABILITIES } from './backend/search-backend.js';
export type { SearchBackend, SearchBackendCapabilities, SearchBackendId } from './backend/search-backend.js';
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
  SearchBackendCapabilityError,
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

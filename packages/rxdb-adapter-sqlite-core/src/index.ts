// 核心类型
export { getRxDBChangeEventType } from './sqlite-core.interface.js';
export type {
  IRxDBAdapterDataChange,
  RowId,
  SQLiteCompatibleType,
  SqliteChangeErrorEvent,
  SqliteChangeErrorListener,
  SqliteChangeErrorPhase,
  SqliteChangeEvent,
  SqliteDataType,
  SqliteResult,
  SqliteSuccessResult
} from './sqlite-core.interface.js';

// 后端接口
export { SQLiteChangeType } from './sqlite-backend.interface.js';
export type {
  SqliteBackend,
  SqliteBackendOptions,
  SqliteData,
  SqliteExecResult,
  UpdateHookCallback
} from './sqlite-backend.interface.js';

// 基础适配器
export { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';
export type {
  AdapterEncryptionFacade,
  SqliteBaseOptions,
  SqliteClientLike,
  TransactionFun
} from './RxDBAdapterSqliteBase.js';

// 密钥环存储
export { SqliteCoreKeyringStorage } from './keyring/sqlite-core-keyring-storage.js';

// 加密补丁遍历
export { envelopePlaintextPatches, unenvelopePlaintextPatches } from './system/encrypt-patch.js';

// Worker 助手
export {
  assertLoadOptionsTransferable,
  releaseComlinkProxy,
  wrapWithComlink,
  wrapWithComlinkEndpoint
} from './create_sqlite_client.js';
export type { CreateSqliteClientOptions } from './create_sqlite_client.js';

// QueryCache 远端行的列契约
export {
  RxDBQueryCacheRowContractError,
  assertQueryCacheRowContract,
  requiredQueryCacheColumns
} from './query-cache-row-contract.js';

// 工具函数
export {
  ROWID,
  RxDBAdapterSqliteError,
  SQLITE_MAX_BIND_VARIABLES,
  deserializeFromEnvelope,
  getEntityObjectFromResult,
  getTableColumnIndexName,
  get_sql_value,
  get_sql_with_params,
  get_table_name,
  get_table_name_by_entity_type,
  get_table_name_by_metadata,
  get_table_name_info,
  isSqlResultEmpty,
  isTableExistedSql,
  normalizeCreateEntity,
  normalizeUpdateEntity,
  quote_sql_identifier,
  rxDBColumnTypeToSqliteType,
  serializeForEnvelope,
  transformEntityValueSqliteToJs,
  transformEntityValueToSql,
  transformValueJsToSqlite,
  transformValueSqliteToJs
} from './sqlite-core.utils.js';
export type { EncryptionContext } from './sqlite-core.utils.js';

// 实体 SQL 生成
export { generate_entity_delete_sql } from './entity/delete_sql.js';
export { generate_entity_deletes_sql } from './entity/deletes_sql.js';
export { generate_entity_insert_sql } from './entity/insert_sql.js';
export type { InsertSqlOptions } from './entity/insert_sql.js';
export { generate_entity_inserts_sql } from './entity/inserts_sql.js';
export { update_sql } from './entity/update_sql.js';

// 查询 SQL 生成
export { count_sql } from './query/count_sql.js';
export { find_by_row_ids_sql } from './query/find_by_row_ids_sql.js';
export { find_sql } from './query/find_sql.js';
export {
  build_rule_group_join,
  get_or_create_relation_alias,
  process_relation_joins,
  try_process_relation_flatmap,
  try_resolve_relation_path
} from './query/join_sql.js';
export type { JoinContext, RuleGroupJoinOptions } from './query/join_sql.js';
export { buildRuleGroup, build_order_by, generate_sql } from './query/query_sql.js';
export type { GenerateSqlResult } from './query/query_sql.js';
export {
  MAIN_TABLE_ALIAS,
  build_rule,
  build_substring_condition,
  format_table_alias,
  get_field_sql,
  get_relation_key,
  get_rule_value,
  get_sql_operator,
  handle_array_in,
  handle_exists,
  handle_flatmap_contains,
  resolve_column_name
} from './query/query_sql.utils.js';
export type { ExistsSubquery, RelationPair } from './query/query_sql.utils.js';
export {
  generate_entity_count_ancestors_sql,
  generate_entity_count_descendants_sql,
  generate_entity_find_ancestors_sql,
  generate_entity_find_descendants_sql,
  generate_tree_sql
} from './query/query_tree_sql.js';

// 仓库基类
export { SqliteRepository } from './repository/SqliteRepository.js';
export { SqliteRepositoryBase } from './repository/SqliteRepositoryBase.js';
export { SqliteTreeRepository } from './repository/SqliteTreeRepository.js';

// 表 SQL 生成
export { create_table_sql } from './table/create_table_sql.js';
export { create_tables_sql } from './table/create_tables_sql.js';
export { remove_all_triggers_sql } from './table/remove_trigger_sql.js';
export { generate_table_trigger_sql } from './table/trigger_sql.js';

// 版本管理
export { dispatch_switch_events, execute_switch_actions } from './version/execute_switch_actions.js';
export { convertSwitchResultToSql } from './version/switch-result.utils.js';
export type { SqliteStatement, SwitchVersionSqlItem, SwitchVersionSqlResult } from './version/switch-result.utils.js';
export { generateSwitchBranchSql, switch_branch } from './version/switch_branch.js';
export { switch_transaction_id } from './version/switch_transaction_id.js';

// 事务结果处理
export {
  remove_entity_ids_from_cache,
  transaction_sqlite_result,
  update_entity_from_sqlite_result
} from './transaction_sqlite_result.js';

// RxDB 适配器批量变更
export { rxdb_adapter_mutations } from './rxdb_adapter_mutations.js';

// 变更事件处理
export { handle_rxdb_change } from './handle_rxdb_change.js';

// 共享客户端工具
export {
  BATCH_TIMEOUT,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  MAX_BATCH_WAIT_MS,
  WAL_AUTOCHECKPOINT_PAGES,
  WATCH_TABLES,
  get_cached_regexp,
  get_init_sql,
  get_persistent_db_file_name,
  validateSqliteNumericOption
} from './sqlite-client.utils.js';
export type { ChangeRecordEvent } from './sqlite-client.utils.js';

// FTS5 DDL 工具（被 @aiao/rxdb-plugin-search 消费）
export {
  FTS_BIGRAM_SQL_FUNCTION,
  buildCreateFtsTableSql,
  buildFtsTriggersSql,
  compileCjkToken,
  hasCjk,
  indexTextForFts
} from './fts5/index.js';
export type { FtsField, FtsTriggerOptions } from './fts5/index.js';

// 共享 oo1 加载工具。
// oo1 = 上游官方 SQLite WASM 的面向对象 API v1（sqlite3.oo1.DB），
// 不是 rxdb 自创缩写；走该面的是 sqlite / sqliteai，wa-sqlite 不走这里。
export {
  buildOo1InitOptions,
  defaultPrintErr,
  defaultWarn,
  isSameOo1LoadConfig,
  resolveLocateFile,
  rewriteOpfsProxyWorkerUrl,
  shouldIgnoreSqliteMessage,
  toOo1LoadFingerprint,
  withGlobalOo1LoadLock,
  withPatchedOpfsProxyWorker,
  withSqliteApiConfig
} from './sqlite-oo1-load.utils.js';
export type { Oo1LoadFingerprint, Oo1LoadOptions } from './sqlite-oo1-load.utils.js';

// 共享 SQL 执行工具
export {
  isReadOnlyStatement,
  normalizeSingleStatementSql,
  shouldUsePreparedStatementPath
} from './execute-sql.utils.js';

// 共享 oo1 运行时类型与边界校验（oo1 = 上游面向对象 API v1）
export { assertOo1Static } from './oo1-types.js';
export type { Oo1Capi, Oo1Database, Oo1PreparedStatement, Oo1Static } from './oo1-types.js';

// 共享 oo1 执行助手（面向 sqlite3.oo1.DB，非 wa-sqlite C API）
export { executeOo1Helper } from './execute_oo1_helper.js';

// 共享 oo1 客户端基类（sqlite / sqliteai 继承；wa-sqlite 不走这里）
export { Oo1ClientBase } from './Oo1ClientBase.js';
export type { Oo1ClientEvents, Oo1ClientLoadOptions, OpfsFallback } from './Oo1ClientBase.js';

export { SqliteTransactionExecutor } from './transaction/SqliteTransactionExecutor.js';

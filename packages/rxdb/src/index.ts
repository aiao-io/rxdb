/**
 * @packageDocumentation
 * RxDB 核心包 - 响应式数据库客户端
 * 提供实体管理、版本控制、查询管理等功能
 */
export * from './entity/entity-base.js';
export * from './entity/entity-field.utils.js';
export * from './entity/entity-value.utils.js';
export * from './entity/entity.decorator.js';
export * from './entity/entity.interface.js';
export * from './entity/entity.utils.js';
export { isEntityInternalName } from './entity/entity.utils.js';
export * from './entity/metadata-options.interface.js';
// 批量写入解析主适配器时抛给调用方的结构化错误。
// 选择器本身（selectPrimaryAdapterKind 等）是 Repository / EntityManager 的共享内部实现。
export { transitionMetadata } from './entity/metadata-transition.js';
export {
  FIELD_FORMAT_CARRIERS,
  FIELD_FORMAT_CONFIG_KEYS,
  FIELD_FORMAT_KINDS,
  formatMetadataViolations,
  validateEntityMetadata,
  validateEntityMetadataSet,
  type EntityMetadataValidationError,
  type FieldFormatConfigKey,
  type MetadataValidationRule,
  type RelationResolutionRule
} from './entity/metadata-validate.js';
export type { EntityMetadata } from './entity/metadata.interface.js';
export {
  RxDBMissingPrimaryAdapterError,
  RxDBMixedPrimaryAdapterError,
  type PrimaryAdapterKind
} from './entity/primary-adapter.js';
export * from './entity/tree-entity-base.js';
export * from './entity/tree-entity.decorator.js';
export * from './entity/tree-entity.interface.js';
export * from './network/reachability.js';
export { query_need_refresh_create as queryNeedRefreshCreate } from './query/need_refresh_create.js';
export { query_need_refresh_remove as queryNeedRefreshRemove } from './query/need_refresh_remove.js';
export { query_need_refresh_update as queryNeedRefreshUpdate } from './query/need_refresh_update.js';
export { isRuleGroup } from './query/query-matching.utils.js';
export * from './repository/diff-metadata.js';
export { isNetworkError } from './repository/network-error.js';
export * from './repository/query-options.interface.js';
export * from './repository/query.interface.js';
export * from './repository/QueryCacheRepository.js';
export type { RefreshMatchRules, RepositoryQueryExtensions } from './repository/QueryManager.interface.js';
export * from './repository/QueryTask.js';
export * from './repository/relation-query.interface.js';
export * from './repository/repository.interface.js';
export * from './repository/Repository.js';
export * from './repository/RepositoryBase.js';
export * from './repository/tree-level.utils.js';
export * from './repository/tree-repository.interface.js';
export * from './rxdb-adapter.js';
export * from './rxdb-events.js';
export * from './rxdb-plugin.js';
export * from './rxdb-utils.js';
export * from './rxdb.interface.js';
export * from './RxDB.js';
export * from './RxDBError.js';
export * from './sync-state.js';
export type { SchemaManager } from './schema/SchemaManager.js';
export * from './system/branch.js';
export {
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_ENTITY_ID_PREFIX,
  RXDB_CHANGE_SCHEMA_VERSION,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY,
  UnsupportedRxDBChangeVersionError,
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  decodeRxDBEntityIdentity,
  encodeRxDBChangeEntityId,
  encodeRxDBChangePatch,
  encodeRxDBEntityIdentity,
  getRxDBEntityIdentityKey,
  parseRxDBEntityIdentityKey
} from './system/change-codec.js';
export * from './system/change.js';
export * from './system/migration.js';
export * from './system/sync.js';
export * from './system/system.interface.js';
export * from './system/types.js';
export * from './transaction/transaction-executor.interface.js';
// 只转类型不转 `checkRepositoryUpdates` 函数本身 ——
// 它是 `VersionManager.checkRepositoryUpdates()` 的内部实现，不进公开 API。
export type { CheckRepositoryUpdatesResult } from './version/check-repository-updates.js';
// 级联调度契约里进公开 API 的只有这两项 —— 抛给调用方的结构化错误，
// 以及错误消息用的仓库键渲染。资格判定谓词是 pull / push 两条路径的共享内部实现。
export { RxDBDependencyFailedError, repositoryKey } from './version/cascade-contract.js';
export * from './version/cleanup-expired.js';
export * from './version/compact-changes.js';
export * from './version/conflict.js';
export * from './version/LWWConflictResolver.js';
// 作用域 undo/redo 撞上跨作用域事务时抛给调用方的结构化错误。
// 选择谓词（isChangeInScope 等）是 HistoryManager 的内部实现，不进公开 API。
export { RxDBCrossScopeTransactionError } from './version/scope-selection.js';
export * from './version/sync-branches.js';
export * from './version/sync-type-utils.js';
export * from './version/VersionManager.interface.js';
export * from './version/VersionManager.utils.js';

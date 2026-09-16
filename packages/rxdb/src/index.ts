/**
 * @packageDocumentation
 * RxDB 核心包 - 响应式数据库客户端
 * 提供实体管理、版本控制、查询管理等功能
 */
export * from './entity/entity-base.js';
export * from './entity/entity-field.utils.js';
// 只转类型不转类：`getEntityStatus()` 的返回值就是它，用户接得到就得能具名。
// 构造器是 EntityManager 的内部装配，不进公开 API。
export type { EntityStatus } from './entity/entity-status.js';
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
// 查询语义的两条判定原语。插件要自己模拟一个仓库（历史插件的集成测试、QueryCache 的
// 本地读）时，`where` 过滤与 `orderBy` 排序必须与核心逐字同源 —— 各写一份就是漂移。
export { calculateOrderBy, isEntityMatchWhere, isRuleGroup } from './query/query-matching.utils.js';
export * from './repository/diff-metadata.js';
export { isNetworkError } from './repository/network-error.js';
export type {
  QueryCacheEngineFactory,
  QueryCachePrimary,
  QueryCacheSession,
  QueryCacheSessionContext
} from './repository/query-cache-engine.interface.js';
export * from './repository/query-cache.interface.js';
// 出站队列本身随 `@aiao/rxdb-plugin-sync` 走（US-025 阶段 D）：它是 changelog 的第二个
// 消费者，与 push / pull 共用 `RxDBSync.lastPushedChangeId` 这一条水位线。核心留下的
// 只有插件往里填的这个接口 —— `Repository` 建 QueryCache 会话时要问一次「谁还占着 id」。
export type { QueryCacheOutboxProvider } from './repository/query-cache-outbox.interface.js';
export * from './repository/query-options.interface.js';
export * from './repository/query.interface.js';
export type {
  QueryOptions,
  RefreshMatchRules,
  RepositoryQueryExtensions
} from './repository/QueryManager.interface.js';
// 同上，只转类型：`Repository.queryManager` 的声明类型。
export type { QueryManager } from './repository/QueryManager.js';
export * from './repository/QueryTask.js';
export * from './repository/relation-query.interface.js';
export * from './repository/repository.interface.js';
export * from './repository/Repository.js';
export * from './repository/RepositoryBase.js';
export * from './repository/tree-level.utils.js';
export * from './repository/tree-repository.interface.js';
export { isRemoteNewer, parseUpdatedAt } from './repository/updated-at.utils.js';
export * from './rxdb-adapter.js';
export * from './rxdb-events.js';
export * from './rxdb-plugin.js';
export * from './rxdb-utils.js';
// `addEventListener` 的形参、`RxDBOptions` 的公开别名、`mergeOperations` 的字段类型 ——
// 三者都出现在用户拿得到的签名上。整文件不转桶，其余成员仍是内部约定。
export * from './rxdb.interface.js';
export * from './RxDB.js';
export type { EventListener, MergeQueryTaskOptions, RxDBConfig } from './rxdb.types.js';
export * from './RxDBError.js';
export type { SchemaManager } from './schema/SchemaManager.js';
export * from './sync-state.js';
export * from './system/branch.js';
export {
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_ENTITY_ID_PREFIX,
  RXDB_CHANGE_SCHEMA_VERSION,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY,
  UnsupportedRxDBChangeVersionError,
  UnsupportedRxDBEntityIdentityVersionError,
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  decodeRxDBEntityIdentity,
  encodeRxDBChangeEntityId,
  encodeRxDBChangePatch,
  encodeRxDBEntityIdentity,
  getRxDBChangeEntityIdQueryValues,
  getRxDBEntityIdentityKey,
  parseRxDBEntityIdentityKey
} from './system/change-codec.js';
export * from './system/change.js';
export * from './system/migration.js';
export * from './system/sync.js';
export * from './system/system-entities.js';
export * from './system/system-repositories.js';
export * from './system/system.interface.js';
export * from './system/types.js';
export * from './system/types.local.js';
export * from './system/types.remote.js';
export * from './transaction/transaction-executor.interface.js';
// 级联调度契约里进公开 API 的只有这两项 —— 抛给调用方的结构化错误，
// 以及错误消息用的仓库键渲染。资格判定谓词是 pull / push 两条路径的共享内部实现。
export { RxDBDependencyFailedError, repositoryKey } from './sync-contract/cascade-contract.js';
// 两条 where 规则构造。推送资格给 push 与待推计数用，离线写资格给 QueryCache 出站队列用；
// 判据 `push` 与 `offlineWrite && !push` 恰好互补，两侧计数相加不会重复计一行。
// 两个消费者自 US-025 阶段 D 起都在 `@aiao/rxdb-plugin-sync` 里，而规则本身是**契约** ——
// 「哪些变更该推」由核心的实体元数据决定，各写一份的那一刻就是漂移的那一刻。
export {
  buildOfflineWriteRepositoryRules,
  buildPushableRepositoryRules
} from './sync-contract/pushable-repository-rules.js';
// 同步水位线（`RxDBSync`）的读写。核心按它判定 QueryCache 出站资格，
// 历史插件按它记录推拉进度——同一张表、同一套解析，不能各写一份。
export * from './sync-contract/compact-changes.js';
export * from './sync-contract/conflict.js';
export * from './sync-contract/LWWConflictResolver.js';
export {
  findCurrentSyncRecord,
  getOrCreateSyncRecord,
  resolvePullIneligibility,
  resolvePushIneligibility
} from './sync-contract/sync-record-utils.js';
export * from './sync-contract/sync-type-utils.js';
// 同步子系统的公开契约形状：推拉选项、结果与历史项。
// 实现在 `@aiao/rxdb-plugin-history`，契约留在核心供适配器与 QueryCache 共用。
export * from './sync-contract/VersionManager.interface.js';
export * from './sync-contract/VersionManager.utils.js';

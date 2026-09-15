/**
 * @packageDocumentation
 * RxDB 核心包 - 响应式数据库客户端
 * 提供实体管理、版本控制、查询管理等功能
 */
// 写捕获接缝（adapter-contract.md §1/§2）。**整条留在核心**：装卸口就在 `RxDBAdapterLocalBase`
// 上，搬走等于核心反向依赖插件。这里只有机制与两道转交门，一个捕获语义都不认识——
// 判定实现随 `@aiao/rxdb-plugin-working-tree` 走。`gateRawWrite` 必须出现在公开面上：
// 适配器包在**包外**，它们的 `rawQuery?()` 是可选方法，核心拦不住，只能由各自实现调这一句。
export * from './capture/index.js';
export * from './entity/entity-base.js';
export * from './entity/entity-field.utils.js';
// 只转类型不转类：`RxDB.entityManager` 是公开成员，用户接得到就得能具名；
// `@aiao/rxdb-plugin-working-tree` 的捕获运行时与提交命令也都把它当形参收。
// 不转类本身是因为构造器要的是整个 RxDB 实例、`init()` / `destroy()` 由宿主按生命周期调——
// 那套装配是宿主的事，转出类只会让人以为可以自己 new 一个。
export type { EntityManager } from './entity/entity-manager.js';
// 只转类型不转类：`getEntityStatus()` 的返回值就是它，用户接得到就得能具名。
// 构造器是 EntityManager 的内部装配，不进公开 API。
export type { EntityStatus } from './entity/entity-status.js';
export * from './entity/entity-value.utils.js';
export * from './entity/entity.decorator.js';
export * from './entity/entity.interface.js';
export * from './entity/entity.utils.js';
export { isEntityInternalName } from './entity/entity.utils.js';
export * from './entity/metadata-options.interface.js';
// 不经装饰器直接产出 `EntityMetadata` 的入口。跨包的元数据夹具（rxdb-adapter-encrypted 的
// 查询校验与 patch 加密测试）靠它拿到一份与装饰器产物同构的元数据——不转出去，包外只能手搓
// 字面量，而那个形状一旦与转换结果分叉，测出来的就不是被测代码的行为。
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
// 批量写入解析主适配器时抛给调用方的结构化错误。
// 选择器本身（selectPrimaryAdapterKind 等）是 Repository / EntityManager 的共享内部实现。
// `getEntitySync` 是例外：实体级 `sync` 覆盖库级配置这条规则决定了一个实体归哪个适配器管，
// 而 `@aiao/rxdb-plugin-working-tree` 的捕获要按同一条规则判「这张表是不是查询缓存」。
// 包外另算一遍不会有编译错误，只会让核心与插件对同一个实体给出两种归属。
export {
  getEntitySync,
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
// 同上，只转类型：`Repository.queryManager` 的声明类型。
export type { QueryManager } from './repository/QueryManager.js';
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
export * from './rxdb-plugin-system.js';
export * from './rxdb-utils.js';
// `addEventListener` 的形参、`RxDBOptions` 的公开别名、`mergeOperations` 的字段类型 ——
// 三者都出现在用户拿得到的签名上。整文件不转桶，其余成员仍是内部约定。
export * from './rxdb.interface.js';
export * from './RxDB.js';
export type { EventListener, MergeQueryTaskOptions, RxDBConfig } from './rxdb.types.js';
export * from './RxDBError.js';
export type { SchemaManager } from './schema/SchemaManager.js';
export * from './sync-state.js';
// active 分支基数守卫（FR-048）。**归核心而不是随提交能力走**：「恰好一个 active 分支」是
// 分支拓扑不变量，核心的 `resolve-current-branch` / `sync-branches` / `create-branch` 本就在写它，
// 与提交能力无关。`ACTIVE_BRANCH_KEY` 必须出现在公开面上：两个后端的 `switch_branch` 是裸 SQL，
// 哨兵值要直接拼进 UPDATE 里。各自抄一份字面量的话，某一端拼错了不会有编译错误——
// 只会让那一端的 active 行安静地退出唯一约束的管辖。
export * from './system/active-branch-guard.js';
export * from './system/branch.js';
export * from './system/capability-watermark.js';
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
  getRxDBEntityIdentityKey,
  parseRxDBEntityIdentityKey,
  type RxDBChangeEntityMetadataResolver
} from './system/change-codec.js';
export * from './system/change.js';
export * from './system/migration.js';
// 内容寻址摘要。必须出现在公开面上：`@aiao/rxdb-plugin-working-tree` 在包外，它的变更单元
// 指纹与提交幂等键都按它算，而这两个 hex 是**落库**的。插件自带一份实现不产生编译错误，
// 只会让同一份数据在两处得出两个 id，症状要到下一次幂等本该命中却没命中时才显形。
export { sha256Hex } from './system/sha256.js';
// 单条、无占位符的条件写入（CAS）所需的字面量拼装，五个 helper 整桶转出。必须在公开面上：
// epic-006 里那两条 CAS 语句（能力启用、HEAD 推进）随插件走，而「判据与写入必须落在同一条
// 语句里」这个约束不允许它们退回参数化路径。转出的是**拒绝转不动的输入**的那一份实现——
// 包外自己拼，转义失败就不是报错，而是一条语法正确、语义错误的语句。详见该文件 @fileoverview。
export * from './system/sql-literal.js';
export * from './system/sync.js';
export * from './system/system-entities.js';
export * from './system/system.interface.js';
export * from './system/types.js';
export * from './transaction/transaction-executor.interface.js';
// 受信写声明通道（adapter-contract.md §3）。**整条留在核心**：`declareTrustedWrite` 对未登记的
// 三段身份当场抛错，这道 fail-closed 门必须对所有用户无条件生效，不能变成「装了插件才有」。
export * from './trusted-write/index.js';
// 只转类型不转 `checkRepositoryUpdates` 函数本身 ——
// 它是 `VersionManager.checkRepositoryUpdates()` 的内部实现，不进公开 API。
export type { CheckRepositoryUpdatesResult } from './version/check-repository-updates.js';
// 级联调度契约里进公开 API 的只有这两项 —— 抛给调用方的结构化错误，
// 以及错误消息用的仓库键渲染。资格判定谓词是 pull / push 两条路径的共享内部实现。
export { RxDBDependencyFailedError, repositoryKey } from './version/cascade-contract.js';
// `VersionManager.bulkSync()` 的形参与返回值。
export type { BulkSyncOptions, BulkSyncResult } from './version/bulk-sync.js';
export * from './version/cleanup-expired.js';
export * from './version/compact-changes.js';
export * from './version/conflict.js';
// `VersionManager.getRepositoryDependencyGraph()` 的返回值。图的构建函数是内部实现。
export type { DependencyGraph } from './version/dependency-graph.js';
// 分支切换路径的求解器。必须出现在公开面上：`@aiao/rxdb-plugin-working-tree` 的启用迁移要按
// 同一套路径判断「已有分支能否完整物化」（research.md R11）。「这两个节点之间怎么走」的答案
// 必须全局只有一个——插件另写一套遍历，迁移期与运行期迟早会对同一个库给出两种答案，
// 表现为迁移放行了一条 `switchBranch` 走不通的分支。
export {
  find_branch_path_to_root,
  find_switch_branch_step,
  type FindBranchPathOptions,
  type SwitchBranchStep
} from './version/find-switch-branch-step.js';
// `getRepositorySyncStatus()` 的返回值（函数本身已由下方 sync-branches 之外的桶转出）。
export type { RepositorySyncStatus } from './version/get-repository-sync-status.js';
export * from './version/LWWConflictResolver.js';
// 作用域 undo/redo 撞上跨作用域事务时抛给调用方的结构化错误。
// 选择谓词（isChangeInScope 等）是 HistoryManager 的内部实现，不进公开 API。
export { RxDBCrossScopeTransactionError } from './version/scope-selection.js';
// 分支 tip 读取，理由同上（research.md R11）：「一条分支现在停在哪」也必须全局只有一个答案。
// **具名转出而不是转整桶**：同文件的 `switch_branch_actions` / `get_switch_version_actions`
// 是 VersionManager 一侧的内部编排（switchBranch / merge / undo-redo / restore，全部调用点
// 都在本包内），摆上公开面等于承诺它们的 action 形状跨版本稳定。
export { get_branch_max_change, type BranchChangeReader } from './version/switch-branch-actions.js';
export * from './version/sync-branches.js';
export * from './version/sync-type-utils.js';
// 只转类型不转类：`RxDB.versionManager` 的声明类型。实例由 RxDB 装配，用户不自己 new。
export * from './version/VersionManager.interface.js';
export type { VersionManager } from './version/VersionManager.js';
// 变更行主键的 codec。必须出现在公开面上：三个后端（supabase / pglite / sqlite-core）在
// **包外**按同一套键解析 `switchBranch` / `mergeChanges` 的结果集，各自抄一份不会有编译错误，
// 只会让某一端把 `namespace:entity:id` 切错位，而切错的那一段仍是合法字符串。
export * from './version/VersionManager.utils.js';

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
// 具名收口（原为 `export *`，连带把九个内部装配手法一起放在了公开面上）。
// 留在面上的五个各有理由：`normalizeCreateEntity` / `normalizeUpdateEntity` 是适配器写
// INSERT / UPDATE 前的字段规范化（两个适配器各 import 一次，共 11 个文件）；
// `getEntityMutations` 是 save 路径的入口（4 个文件）；`isEntityInternalName` 本就是
// 此前显式具名转出的那一个；`entityDefaultNow` 是用户实体唯一能接上「同一次填充共享一个
// 时刻」的入口——核心自己的 `createdAt` / `updatedAt` 就是这么定义的（`entity-base.ts`），
// 用户实体写 `default: () => entityDefaultNow()` 才能拿到同样的语义，收掉它等于把这条
// 语义变成核心专有（它的 TSDoc `@example` 写的正是这个用法）。
//
// 收掉的九个全仓零包外 import：`setSafeObjectKey` / `setRuntimeObjectKey` /
// `setRuntimeObjectGetter` / `setSafeObjectWritableKey` / `setSafeObjectKeyLazyInitOnce` 是
// `Object.defineProperty` 的五个包装，往实体类与实例上挂不可枚举的元数据载体；
// `fillDefaultValue` / `fillInitValue` 是构造期的填充步骤，前者还握着模块级的 `fillInstant`
// 时刻栈——包外调用它等于在实体构造之外改写那个栈；`getNeedSaveEntities` /
// `getNeedRemoveEntities` 是 `EntityManager` 保存与删除路径的自由函数副本，
// 同名的 `EntityStatus` 方法仍在公开面上（包外用的一直是方法，不是这两个函数）。
export {
  entityDefaultNow,
  getEntityMutations,
  isEntityInternalName,
  normalizeCreateEntity,
  normalizeUpdateEntity,
  type EntityMutationsOptions
} from './entity/entity.utils.js';
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
  RxDBMissingPrimaryAdapterError,
  RxDBMixedPrimaryAdapterError,
  getEntitySync,
  type PrimaryAdapterKind
} from './entity/primary-adapter.js';
export * from './network/reachability.js';
export { query_need_refresh_create as queryNeedRefreshCreate } from './query/need_refresh_create.js';
export { query_need_refresh_remove as queryNeedRefreshRemove } from './query/need_refresh_remove.js';
export { query_need_refresh_update as queryNeedRefreshUpdate } from './query/need_refresh_update.js';
// 查询语义的两条判定原语。插件要自己模拟一个仓库（历史插件的集成测试、QueryCache 的
// 本地读）时，`where` 过滤与 `orderBy` 排序必须与核心逐字同源 —— 各写一份就是漂移。
export { calculateOrderBy, isEntityMatchWhere, isRuleGroup } from './query/query-matching.utils.js';
// 增量合并原语。插件要把某类查询的合并整体接管走（树查询就是真增量，不像图查询一律
// refresh），就得用核心这套判定：哪些实体在本批更新里由不匹配变匹配、外部更新怎么落到
// 已缓存的实体实例上、事件是不是已经过期。各插件自行复刻一份等于埋下静默漂移。
// 这批符号进 API 基线，受兼容承诺约束。
export type { IncrementalUpdateContext, UpdateClassification } from './query/merge-update.utils.js';
// `UpdateDataCache` 转的是**类**而不只是类型：它是一批更新事件的惰性解包缓存，
// 插件接管某类查询的合并时要自己 `new` 一个（树的四个 handler 全靠它把同一批事件
// 的 `data` 只解一次）。只转类型的话，包外拿得到形参签名却造不出实参。
export {
  UpdateDataCache,
  applyExternalEntityUpdate,
  getEntityId,
  prepareIncrementalUpdate
} from './query/merge-update.utils.js';
export { isStaleEntityEvent, isStaleEntityRemoveEvent } from './query/stale-event.utils.js';
// 查询任务指纹计算。插件自带 Repository 时必须自己给 `createTask` 传 `getFingerprint`，
// 而指纹正是 QueryManager 判定「结果变没变」的依据 —— 各写一份就是两套「变了」的定义。
export * from './repository/diff-metadata.js';
export * from './repository/fingerprint.utils.js';
export { isNetworkError } from './repository/network-error.js';
export { assertOptionalNonNegativeSafeInteger } from './repository/number-validation.utils.js';
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
// 具名收口：本模块只有这两个导出，收口不改变表面，改变的是**下一次**往这里加内部符号时
// 要不要顺手上公开面——`export *` 的答案是「自动上」。
export { QueryTask, type QueryTaskOptions } from './repository/QueryTask.js';
export * from './repository/relation-query.interface.js';
export * from './repository/repository.interface.js';
export * from './repository/Repository.js';
export * from './repository/RepositoryBase.js';
export { isRemoteNewer, parseUpdatedAt } from './repository/updated-at.utils.js';
export * from './rxdb-adapter.js';
export * from './rxdb-events.js';
export * from './rxdb-plugin-system.js';
export * from './rxdb-plugin.js';
export * from './rxdb-utils.js';
// `addEventListener` 的形参与 `RxDBOptions` 的公开别名 —— 两者都出现在用户拿得到的
// 签名上。整文件不转桶，其余成员仍是内部约定。
export * from './rxdb.interface.js';
export * from './RxDB.js';
export type { EventListener, RxDBConfig } from './rxdb.types.js';
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
  getRxDBChangeEntityIdQueryValues,
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
export * from './system/system-repositories.js';
export * from './system/system.interface.js';
export * from './system/types.js';
export * from './system/types.local.js';
export * from './system/types.remote.js';
export * from './transaction/transaction-executor.interface.js';
// 受信写声明通道（adapter-contract.md §3）。**整条留在核心**：`declareTrustedWrite` 对未登记的
// 三段身份当场抛错，这道 fail-closed 门必须对所有用户无条件生效，不能变成「装了插件才有」。
export * from './trusted-write/index.js';
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

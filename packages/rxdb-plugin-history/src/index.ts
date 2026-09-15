/**
 * @packageDocumentation
 * `@aiao/rxdb-plugin-history` —— 历史、撤销重做、分支与推拉同步。
 *
 * @remarks
 * 核心 `@aiao/rxdb` 只保留**原语**：三张系统表（{@link RxDBBranch} / `RxDBChange` /
 * `RxDBSync`）、变更编解码、冲突模型与同步资格判定。原因是这些东西并不属于历史子系统 ——
 * 变更日志触发器直接写 `branchId`，`RxDBChange.branch` 会生成真实的
 * `REFERENCES rxdb$rxdb_branch(id)` 外键，整条响应式增量链路都跑在 `rxdb_change` 上。
 *
 * 搬进本包的是**消费者**：读历史、撤销重做、建/切/合/删分支，以及推拉同步的调度。
 *
 * @example
 * ```ts
 * import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
 *
 * rxdb.use(rxDBPluginHistory);
 * await rxdb.connect();
 *
 * // 撤销重做走作用域 API：无参 = 整库，传实体类 = 该仓储，传实例 = 该行
 * await rxdb.versionManager.history().undo();
 * ```
 */
export * from './plugin.js';
// `VersionManager.checkRepositoryUpdates()` 的返回值。函数本身是内部实现。
export type { CheckRepositoryUpdatesResult } from './check-repository-updates.js';
// `VersionManager.bulkSync()` 的形参与返回值。
export type { BulkSyncOptions, BulkSyncResult } from './bulk-sync.js';
export * from './cleanup-expired.js';
// `VersionManager.getRepositoryDependencyGraph()` 的返回值。图的构建函数是内部实现。
export type { DependencyGraph } from './dependency-graph.js';
// `getRepositorySyncStatus()` 的返回值。
export type { RepositorySyncStatus } from './get-repository-sync-status.js';
// 作用域 undo/redo 撞上跨作用域事务时抛给调用方的结构化错误。
// 选择谓词（isChangeInScope 等）是 HistoryManager 的内部实现，不进公开 API。
export { RxDBCrossScopeTransactionError } from './scope-selection.js';
export * from './sync-branches.js';
// 实例由插件装配，用户不自己 new，因此只转类型不转类。
export type { VersionManager } from './VersionManager.js';

/**
 * @packageDocumentation
 * `@aiao/rxdb-plugin-sync` —— 推拉同步、冲突处理与仓库依赖序。
 *
 * @remarks
 * 核心 `@aiao/rxdb` 只保留**原语**：`RxDBSync` 水位表、变更编解码、冲突模型
 * （`ConflictResolution` / `RxDBConflictError`）与同步资格判定。搬进本包的是**消费者**：
 * 整库与单仓库两个粒度的 push / pull / sync、冲突落地、依赖拓扑序、过期清理与出站队列。
 *
 * US-025 阶段 D 之前这些入口挂在 `@aiao/rxdb-plugin-history` 的 `VersionManager` 上。
 * 两件事的生命周期本就不同：撤销重做要在第一条 `rxdb_change` 之前就位，推拉同步则只在
 * 配了远端时才有意义，所以它们各自成包。
 *
 * 本包 `inject: ['plugin:history']`，反向没有依赖——历史包不认识本包。这条单向耦合只走
 * 一张窄接口：一次往返结束时 undo 边界要作废、待拉计数要结算，而那些状态的主人在历史侧。
 *
 * @example
 * ```ts
 * import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
 * import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
 *
 * rxdb.use(rxDBPluginHistory);
 * rxdb.use(rxDBPluginSync);
 * await rxdb.connect();
 *
 * await rxdb.syncManager.sync();
 * ```
 */
export * from './plugin.js';
// `SyncManager.bulkSync()` 的形参与返回值。
export type { BulkSyncOptions, BulkSyncResult } from './bulk-sync.js';
// `SyncManager.checkRepositoryUpdates()` 的返回值。函数本身是内部实现。
export type { CheckRepositoryUpdatesResult } from './check-repository-updates.js';
export * from './cleanup-expired.js';
// `SyncManager.getRepositoryDependencyGraph()` 的返回值。图的构建函数是内部实现。
export type { DependencyGraph } from './dependency-graph.js';
// `getRepositorySyncStatus()` 的返回值。
export type { RepositorySyncStatus } from './get-repository-sync-status.js';
export * from './sync-branches.js';
// 实例由插件装配，用户不自己 new，因此只转类型不转类。
export type { SyncManager } from './SyncManager.js';

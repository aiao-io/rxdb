/**
 * @packageDocumentation
 * `@aiao/rxdb-plugin-history` —— 历史、撤销重做与分支。
 *
 * @remarks
 * 核心 `@aiao/rxdb` 只保留**原语**：三张系统表（{@link RxDBBranch} / `RxDBChange` /
 * `RxDBSync`）、变更编解码、冲突模型与同步资格判定。原因是这些东西并不属于历史子系统 ——
 * 变更日志触发器直接写 `branchId`，`RxDBChange.branch` 会生成真实的
 * `REFERENCES rxdb$rxdb_branch(id)` 外键，整条响应式增量链路都跑在 `rxdb_change` 上。
 *
 * 搬进本包的是**消费者**：读历史、撤销重做、建/切/合/删分支。
 *
 * 推拉同步的调度**不在这里**。US-025 阶段 D 之后它住在 `@aiao/rxdb-plugin-sync`：
 * `rxdb.syncManager.push()` / `.pull()` / `.sync()`。那个插件 `inject: ['plugin:history']`，
 * 反向则没有依赖——本包不认识同步包。
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
// 作用域 undo/redo 撞上跨作用域事务时抛给调用方的结构化错误。
// 选择谓词（isChangeInScope 等）是 HistoryManager 的内部实现，不进公开 API。
export { RxDBCrossScopeTransactionError } from './scope-selection.js';
// 实例由插件装配，用户不自己 new，因此只转类型不转类。
export type { VersionManager } from './VersionManager.js';

// ---------------------------------------------------------------------------
// 以下四项只为 `@aiao/rxdb-plugin-sync` 而导出，全部标了 `@internal`：
// 同步插件是本包唯一的下游插件（它 `inject: ['plugin:history']`），一次 pull / push
// 结束时 undo 边界要作废、待拉计数要结算，而那些状态的主人在本包。接口窄且单向，
// 见 `sync-history-bridge.ts` 的文件头。应用代码不该引用它们。
// ---------------------------------------------------------------------------
export { isIgnorableDetachedVersionEventError } from './detached-event-error.js';
// 登记处是**类**导出而非类型导出：同步插件的 push 用例要 `new` 一个真的出来
// （替身会把要验的东西验掉），而两包之间只有 `dist` 一条路，没有深路径可走。
export { PushInFlightRegistry } from './push-inflight.js';
export type { PushInFlightSession } from './push-inflight.js';
export type { SyncHistoryBridge } from './sync-history-bridge.js';

// ---------------------------------------------------------------------------
// 以下六项只为 `@aiao/rxdb-plugin-working-tree` 而导出，全部标了 `@internal`：
// 工作树插件的 commit 迁移（`commit/enable-migration.ts`）要在放行一条分支之前，
// 先按 `switchBranch` 的同一口径问两件事——「父链自不自洽」与「这条分支现在停在哪」；
// 它的物化屏障（`working-tree/materialize-branch.ts`）要在切换事务里按同一口径撤掉
// 来源分支的投影，手上只有事务执行器的仓库。另写一条同义查询，迟早会在「回滚标记算不算」
// 或「排序列是哪一个」上与切换路径分叉，表现为迁移放行了一条 `switchBranch` 走不通的分支
// （research.md R11），或物化后留下一截来源分支的数据。
// 两包之间只有 `dist` 一条路，没有深路径可走，所以从桶里出。应用代码不该引用它们。
// ---------------------------------------------------------------------------
export { find_branch_path_to_root, find_switch_branch_step } from './find-switch-branch-step.js';
export type { SwitchBranchStep } from './find-switch-branch-step.js';
export { compute_switch_branch_actions, get_branch_max_change } from './switch-branch-actions.js';
export type { SwitchBranchActionReaders } from './switch-branch-actions.js';

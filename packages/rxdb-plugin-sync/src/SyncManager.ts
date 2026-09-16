import {
  getCurrentBranch,
  getEntityMetadata,
  getLocalSystemRepositories,
  getRemoteSystemRepositories,
  PullOptions,
  PullResult,
  PushOptions,
  PushResult,
  RxDB,
  RxDBPartialSyncError,
  SyncResult
} from '@aiao/rxdb';
import type { PushInFlightRegistry, SyncHistoryBridge } from '@aiao/rxdb-plugin-history';
import { Subscription } from 'rxjs';
import { bulkSync, type BulkSyncOptions, type BulkSyncResult } from './bulk-sync.js';
import { checkRepositoryUpdates, type CheckRepositoryUpdatesResult } from './check-repository-updates.js';
import { cleanupExpired, type CleanupExpiredOptions, type CleanupExpiredResult } from './cleanup-expired.js';
import { buildDependencyGraph, type DependencyGraph, type RepositoryIdentifier } from './dependency-graph.js';
import { getAllRepositorySyncStatus, type GetAllRepositorySyncStatusFilter } from './get-all-repository-sync-status.js';
import { getRepositorySyncStatus, type RepositorySyncStatus } from './get-repository-sync-status.js';
import { pullRepository, type PullRepositoryOptions, type PullRepositoryResult } from './pull-repository.js';
import { pull } from './pull.js';
import { pushRepository, type PushRepositoryOptions, type PushRepositoryResult } from './push-repository.js';
import { push } from './push.js';
import { syncBranches, type SyncBranchesResult } from './sync-branches.js';
import { setupSyncListeners } from './sync-listeners.js';
import { hasSyncedData, partialResultOf, partialSyncInvalidatesHistory } from './sync-manager.utils.js';
import { syncRepository, type SyncRepositoryOptions, type SyncRepositoryResult } from './sync-repository.js';
import { topologicalSort, type SortDirection } from './topological-sort.js';

/**
 * 同步管理器
 *
 * 负责整库与单仓库两个粒度的推拉同步：
 * - `pull` / `push` / `sync`：整库
 * - `pullRepository` / `pushRepository` / `syncRepository` / `bulkSync`：按仓库
 * - `getRepositorySyncStatus` / `checkRepositoryUpdates` / `cleanupExpired`：状态与清理
 * - `getRepositoryDependencyGraph` / `getRepositorySyncOrder`：依赖图与同步顺序
 *
 * @remarks
 * US-025 阶段 D 之前这些入口挂在 `@aiao/rxdb-plugin-history` 的 `VersionManager` 上。
 * 切开的理由是两件事的生命周期本就不同：撤销重做要在第一条 `rxdb_change` 之前就位，
 * 推拉同步则只在配了远端时才有意义。
 *
 * 切开之后仍有一条**单向**耦合：一次同步往返结束时 undo 边界要作废、待拉计数要结算，
 * 而那些状态的主人是历史侧。它经 {@link SyncHistoryBridge} 这一张窄接口相遇 ——
 * 本插件 `inject: ['plugin:history']`，历史插件则对本包一无所知。
 */
export class SyncManager {
  #event_removers: Array<() => void> = [];
  #subscriptions: Subscription[] = [];

  /**
   * 「哪些变更此刻正在飞往远端」的登记处。
   *
   * @remarks
   * push 与 undo 唯一的会合点，实例的主人在历史侧（`rxdb.versionManager.pushInFlight`）。
   * 两边读的必须是同一个，见 `PushInFlightRegistry`：push 在远端往返之前认领区间，
   * undo 把认领区间当成已推 —— 各持一份，往返窗口内的一次撤销就会造成永久分叉。
   *
   * @internal
   */
  get pushInFlight(): PushInFlightRegistry {
    return this.history.pushInFlight;
  }

  /**
   * @param rxdb - 宿主实例
   * @param history - 历史侧借来的那一小块面，由 `rxdb.versionManager.syncBridge` 提供
   */
  constructor(
    public readonly rxdb: RxDB,
    readonly history: SyncHistoryBridge
  ) {}

  /** 装上 connected$ 自动回推与远端事件计数两条链路 */
  init() {
    const { subscriptions, removers } = setupSyncListeners(this);
    this.#subscriptions.push(...subscriptions);
    this.#event_removers.push(...removers);
  }

  /** 拆掉 {@link init} 装上的全部监听与订阅 */
  destroy() {
    for (const remove of this.#event_removers) {
      remove();
    }
    this.#event_removers.length = 0;
    for (const sub of this.#subscriptions) {
      sub.unsubscribe();
    }
    this.#subscriptions.length = 0;
  }

  /** 取本地适配器上的系统表仓库 */
  async getLocalRepositories() {
    return getLocalSystemRepositories(this.rxdb);
  }

  /** 取远端适配器上的系统表仓库 */
  async getRemoteRepositories() {
    return getRemoteSystemRepositories(this.rxdb);
  }

  /**
   * 取当前分支；没有激活分支时激活（或新建）`main`。
   *
   * @remarks
   * 同步链路里每条远端事件都要调它（`sync-listeners` 的 `filterByBranch`），
   * 热路径不开事务，见 `getCurrentBranch`。
   */
  async getCurrentBranch() {
    return getCurrentBranch(this.rxdb);
  }

  /**
   * 从远程同步所有分支信息到本地
   *
   * 远程新分支 → 在本地创建（local: false, remote: true）
   * 本地已有的远程分支 → 更新 remote 标记为 true
   * 纯本地分支 → 不受影响
   *
   * @returns 同步结果
   *
   * @example
   * ```typescript
   * const result = await rxdb.syncManager.syncBranches();
   * console.log(`新增 ${result.created}，更新 ${result.updated}`);
   * ```
   */
  async syncBranches(): Promise<SyncBranchesResult> {
    return syncBranches(this);
  }

  /**
   * 从远程拉取变更并应用到本地数据库
   *
   * 当 autoSync=false 时，会先应用 Realtime 缓存的变更，再拉取远程变更。
   *
   * @param options - 可选配置
   * @returns 拉取结果
   *
   * @example
   * ```typescript
   * // 基本用法
   * const result = await rxdb.syncManager.pull();
   * console.log(`Pulled ${result.pulled} changes`);
   *
   * // 拉取所有数据
   * const result = await rxdb.syncManager.pull({ fetchAll: true });
   * ```
   */
  async pull(options?: PullOptions): Promise<PullResult> {
    let result: PullResult;
    try {
      result = await this.history.syncing(() => this.#pullAndSettle(options));
    } catch (error) {
      // repositoryFilter 逐仓拉取时，前面的仓库可能已经真实落库
      // 随后某个仓库失败会抛 RxDBPartialSyncError。此前这里直接 rethrow，
      // undo 边界从未按已提交的部分推进，用户仍能 undo 到「合并前」的内容，
      // 与已落库的远端数据产生分叉。
      if (partialSyncInvalidatesHistory(error)) {
        this.history.clearUndoHistory();
      }
      throw error;
    }

    // 远端变更改写了本地实体数据时才清空 undo/redo 历史：已与远程合并，无法 undo 合并前的内容。
    // 判据是 historyInvalidated 而非 pulled —— 拉回来的变更可能被压缩全部抵消，
    // 一条实体数据都没动，此时历史边界仍然有效。
    if (result.historyInvalidated) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 将本地未同步的变更推送到远程数据库
   *
   * 推送时会自动：
   * 1. 查询 lastPushedChangeId 之后的新变更
   * 2. 过滤已撤销的变更（revertChangeId != null）
   * 3. 压缩变更（INSERT→DELETE 丢弃，INSERT→UPDATE* 合并为 INSERT）
   * 4. 批量推送到远程
   * 5. 更新 lastPushedChangeId 和 lastPushedAt
   *
   * @param options - 可选配置
   * @returns 推送结果
   *
   * @example
   * ```typescript
   * // 基本用法
   * const result = await rxdb.syncManager.push();
   * console.log(`Pushed ${result.pushed} changes`);
   *
   * // 自定义批量大小
   * const result = await rxdb.syncManager.push({ batchSize: 500 });
   * ```
   */
  async push(options?: PushOptions): Promise<PushResult> {
    const result = await this.history.syncing(() => push(this, options));

    // 当 push 有数据变更时，清空 undo/redo 历史
    // 因为已与远程合并，无法 undo 合并前的内容
    if (result.pushed > 0) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 执行完整的同步操作（先 pull 再 push）
   *
   * 推荐在重连后使用此方法，确保：
   * 1. 先获取远程最新变更（避免覆盖他人数据）
   * 2. 再推送本地变更
   *
   * @param options - 可选配置
   * @returns 同步结果（包含 pull 和 push 结果）
   *
   * @example
   * ```typescript
   * // 基本用法
   * const result = await rxdb.syncManager.sync();
   * console.log(`Pulled ${result.pullResult.pulled}, Pushed ${result.pushResult.pushed}`);
   * ```
   */
  async sync(options?: { pull?: PullOptions; push?: PushOptions }): Promise<SyncResult> {
    // pull 成功、push 才抛错时，这段进度不随返回值出来 —— 提到闭包外，catch 里才看得见
    // 「已经合并进来的那部分」。否则远端变更已落库，undo 边界却原地不动。
    let settledPull: PullResult | undefined;

    let result: SyncResult;
    try {
      result = await this.history.syncing(async () => {
        // 先 pull 再 push
        settledPull = await this.#pullAndSettle(options?.pull);
        const pushResult = await push(this, options?.push);

        return { pullResult: settledPull, pushResult };
      });
    } catch (error) {
      // 部分成功同样要推进 undo 边界，进度落在两处之一：pull 中途失败时挂在
      // RxDBPartialSyncError.result 上，pull 已结算而 push 失败时只存在于 settledPull。
      if (settledPull?.historyInvalidated === true || partialSyncInvalidatesHistory(error)) {
        this.history.clearUndoHistory();
      }
      throw error;
    }

    // 当 pull 改写了实体数据、或 push 有上行时，清空 undo/redo 历史
    // 因为已与远程合并，无法 undo 合并前的内容
    if (result.pullResult.historyInvalidated || result.pushResult.pushed > 0) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 拉取指定 Repository 的远程变更
   *
   * 提供实体类型级别的精细同步控制，支持级联同步以自动拉取关联实体。
   *
   * @param namespace - 实体命名空间（如 "public"）
   * @param entity - 实体名称（如 "Todo"）
   * @param options - 拉取选项
   * @returns 拉取结果
   *
   * @example
   * ```typescript
   * // 拉取 Todo 并级联拉取依赖
   * const result = await rxdb.syncManager.pullRepository('public', 'Todo', {
   *   includeRelated: true // 默认：若 Todo 有外键则自动拉取 User
   * });
   *
   * // 不级联拉取
   * const result = await rxdb.syncManager.pullRepository('public', 'Todo', {
   *   includeRelated: false // 仅拉取 Todo，可能引发外键错误
   * });
   * ```
   */
  async pullRepository(
    namespace: string,
    entity: string,
    options?: PullRepositoryOptions
  ): Promise<PullRepositoryResult> {
    let result: PullRepositoryResult;
    try {
      result = await this.history.syncing(() => pullRepository(this, namespace, entity, options));
    } catch (error) {
      // fetchAll 多轮拉取中途失败时，前面几轮的事务已经真实提交
      // 会抛 RxDBPartialSyncError 而非裸错误。此前这里直接 rethrow，undo 边界
      // 从未按已提交的部分推进，用户仍能 undo 到「合并前」的内容。
      if (partialSyncInvalidatesHistory(error)) {
        this.history.clearUndoHistory();
      }
      throw error;
    }

    // 有实体数据被改写时清空 undo/redo 历史（级联依赖仓的改写也算在内）
    if (result.historyInvalidated) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 推送指定 Repository 的本地变更
   *
   * 提供实体类型级别的精细同步控制，支持级联同步以自动推送依赖实体。
   *
   * @param namespace - 实体命名空间（如 "public"）
   * @param entity - 实体名称（如 "User"）
   * @param options - 推送选项
   * @returns 推送结果
   *
   * @example
   * ```typescript
   * // 推送 User 并级联推送依赖方
   * const result = await rxdb.syncManager.pushRepository('public', 'User', {
   *   includeRelated: true // 默认：若 Post 引用 User 则自动推送 Post
   * });
   *
   * // 不级联推送
   * const result = await rxdb.syncManager.pushRepository('public', 'User', {
   *   includeRelated: false // 仅推送 User，依赖数据可能不完整
   * });
   * ```
   */
  async pushRepository(
    namespace: string,
    entity: string,
    options?: PushRepositoryOptions
  ): Promise<PushRepositoryResult> {
    const result = await this.history.syncing(() => pushRepository(this, namespace, entity, options));

    // 有数据变更时清空 undo/redo 历史
    if (result.pushed > 0) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 同步指定 Repository（先 pull 再 push）
   *
   * 将单个 Repository 的 pull 和 push 合并为一次操作，保证正确的执行顺序。
   * 推荐在需要确保特定实体类型数据一致性时使用。
   *
   * @param namespace - 实体命名空间（如 "public"）
   * @param entity - 实体名称（如 "Todo"）
   * @param options - 同步选项（分别配置 pull 和 push）
   * @returns 同步结果（包含 pull 和 push 结果）
   *
   * @example
   * ```typescript
   * // 基本用法
   * const result = await rxdb.syncManager.syncRepository('public', 'Todo');
   * console.log(`Pulled ${result.pullResult.pulled}, Pushed ${result.pushResult.pushed}`);
   *
   * // 自定义 pull 和 push 选项
   * const result = await rxdb.syncManager.syncRepository('public', 'Todo', {
   *   pull: { limit: 500, fetchAll: true },
   *   push: { batchSize: 100 }
   * });
   * ```
   */
  async syncRepository(
    namespace: string,
    entity: string,
    options?: SyncRepositoryOptions
  ): Promise<SyncRepositoryResult> {
    let result: SyncRepositoryResult;
    try {
      result = await this.history.syncing(() => syncRepository(this, namespace, entity, options));
    } catch (error) {
      // 与 pullRepository 同口径：pull 落库或 push 上行之后失败，都会包成
      // RxDBPartialSyncError 抛出，那部分数据已经与远端合并、undo 不回去了。
      if (partialSyncInvalidatesHistory(error)) {
        this.history.clearUndoHistory();
      }
      throw error;
    }

    // 有数据变更时清空 undo/redo 历史
    if (result.pullResult.historyInvalidated || result.pushResult.pushed > 0) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 清理不再满足过滤条件的本地过期数据
   *
   * 用于 SyncType.Filter 场景，删除不满足 filter 条件的本地数据
   * 例如：清理超过 30 天的订单数据
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名称
   * @param options - 清理选项
   * @returns 清理结果
   *
   * @example
   * ```ts
   * const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * const { removed } = await rxdb.syncManager.cleanupExpired('public', 'Order', {
   *   filter: {
   *     combinator: 'and',
   *     rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
   *   }
   * });
   * console.log(`Removed ${removed} expired records`);
   * ```
   */
  async cleanupExpired(
    namespace: string,
    entity: string,
    options?: CleanupExpiredOptions
  ): Promise<CleanupExpiredResult> {
    return cleanupExpired(this, namespace, entity, options);
  }

  /**
   * 检查远程是否有更新，不下载数据
   *
   * 仅查询远程有多少新变更，不实际拉取数据。
   * 适用于显示「有 N 条远程更新」提示，节省带宽和时间。
   *
   * @param namespace - 实体命名空间（如 "public"）
   * @param entity - 实体名称（如 "Todo"）
   * @returns 更新检查结果
   *
   * @example
   * ```typescript
   * // 检查 Todo 是否有远程更新
   * const result = await rxdb.syncManager.checkRepositoryUpdates('public', 'Todo');
   * if (result.hasUpdates) {
   *   console.log(`有 ${result.pendingCount} 条更新可拉取`);
   *   // 用户点击「更新」按钮后再调用 pullRepository()
   * }
   * ```
   */
  async checkRepositoryUpdates(namespace: string, entity: string): Promise<CheckRepositoryUpdatesResult> {
    return checkRepositoryUpdates(this.rxdb, namespace, entity);
  }

  /**
   * 获取单个 Repository 的同步状态
   *
   * 返回完整的同步状态信息，包括：
   * - syncType（full/remote/local/disabled）
   * - pushableCount（待推送的本地变更数）
   * - pullableCount（可拉取的远程变更数）
   * - 最近同步时间戳
   *
   * @param namespace - 实体命名空间（如 "public"）
   * @param entity - 实体名称（如 "Todo"）
   * @returns Repository 同步状态
   *
   * @example
   * ```typescript
   * const status = await rxdb.syncManager.getRepositorySyncStatus('public', 'Todo');
   * console.log(`同步类型: ${status.syncType}`);
   * console.log(`待推送: ${status.pushableCount}，可拉取: ${status.pullableCount}`);
   * ```
   */
  async getRepositorySyncStatus(namespace: string, entity: string): Promise<RepositorySyncStatus> {
    return getRepositorySyncStatus(this.rxdb, namespace, entity);
  }

  /**
   * 获取所有 Repository 的同步状态
   *
   * 返回所有已注册实体的状态，支持可选过滤。
   *
   * @param filter - 可选过滤条件
   * @returns Repository 同步状态数组
   *
   * @example
   * ```typescript
   * // 获取全部状态
   * const statuses = await rxdb.syncManager.getAllRepositorySyncStatus();
   *
   * // 仅获取有待处理变更的 Repository
   * const pending = await rxdb.syncManager.getAllRepositorySyncStatus({
   *   hasPendingChanges: true
   * });
   *
   * // 仅获取已启用的全量同步 Repository
   * const fullSync = await rxdb.syncManager.getAllRepositorySyncStatus({
   *   syncType: ['full'],
   *   enabled: true
   * });
   * ```
   */
  async getAllRepositorySyncStatus(filter?: GetAllRepositorySyncStatusFilter): Promise<RepositorySyncStatus[]> {
    return getAllRepositorySyncStatus(this.rxdb, filter);
  }

  /**
   * 按各仓库持久化的远端水位线重新计算待拉变更数
   *
   * @returns 当前远端待拉变更总数
   *
   * @remarks
   * 远程适配器在实时订阅恢复后调用。若刷新期间又收到实时事件，保留两者中的较大值，
   * 避免把查询快照之后到达的通知覆盖掉。
   */
  async refreshPullableCount(): Promise<number> {
    const token = this.history.beginPullableSettlement();
    const statuses = await getAllRepositorySyncStatus(this.rxdb);
    const count = statuses.reduce((total, status) => total + (status.enabled ? status.pullableCount : 0), 0);
    this.history.reconcilePullableCount(token, count);
    return count;
  }

  /**
   * 批量同步多个 Repository
   *
   * 在单次操作中同步多个 Repository，支持顺序或并发执行。
   *
   * @param options - 批量同步选项
   * @returns 批量同步结果（包含成功/失败计数）
   *
   * @example
   * ```typescript
   * // 顺序同步所有已启用的 Repository
   * const result = await rxdb.syncManager.bulkSync();
   * console.log(`成功: ${result.succeeded}，失败: ${result.failed}`);
   *
   * // 同步指定 Repository
   * const result = await rxdb.syncManager.bulkSync({
   *   repositories: [
   *     { namespace: 'public', entity: 'Todo' },
   *     { namespace: 'public', entity: 'User' }
   *   ]
   * });
   *
   * // 并发模式仅 pull
   * const result = await rxdb.syncManager.bulkSync({
   *   concurrent: true,
   *   concurrency: 3,
   *   push: false
   * });
   *
   * // 检查每项结果
   * for (const item of result.results) {
   *   if (item.success) {
   *     console.log(`${item.repository.entity}: 已拉取 ${item.result?.pullResult.pulled ?? 0} 条`);
   *   } else {
   *     console.error(`${item.repository.entity}: ${item.error.message}`);
   *   }
   * }
   * ```
   */
  async bulkSync(options?: BulkSyncOptions): Promise<BulkSyncResult> {
    const result = await this.history.syncing(() => bulkSync(this.rxdb, options));

    // 与 pull/push/sync 保持一致：任一仓库产生数据变更时清空 undo/redo 历史，
    // 因为已与远程合并，无法 undo 合并前的内容。
    //
    // 失败项同样要算：仓库在失败前可能已经提交了部分进度，它藏在
    // `item.error` 的 `RxDBPartialSyncError.result` 里。只看 `item.result` 会漏掉这部分——
    // 远端数据已落库，用户却仍能 undo 回同步前状态，重新制造本地/远端分叉
    const hasChanges = result.results.some(
      item => hasSyncedData(item.result) || hasSyncedData(partialResultOf(item.error))
    );
    if (hasChanges) {
      this.history.clearUndoHistory();
    }

    return result;
  }

  /**
   * 获取所有 Repository 的依赖图
   *
   * 分析实体关系（MANY_TO_ONE、ONE_TO_ONE）以构建依赖图，
   * 展示各 Repository 之间的依赖关系。
   *
   * @returns 包含依赖关系的依赖图
   *
   * @example
   * ```typescript
   * const graph = rxdb.syncManager.getRepositoryDependencyGraph();
   *
   * // 遍历依赖关系
   * for (const [key, dep] of graph) {
   *   console.log(`${key} 依赖:`, dep.dependsOn);
   *   console.log(`${key} 被依赖:`, dep.requiredBy);
   * }
   * ```
   */
  getRepositoryDependencyGraph(): DependencyGraph {
    const entities = this.rxdb.config.entities.map(EntityClass => getEntityMetadata(EntityClass));
    return buildDependencyGraph(entities);
  }

  /**
   * 根据依赖关系获取 Repository 的同步顺序
   *
   * 通过拓扑排序确定基于依赖关系的正确同步顺序。
   *
   * @param direction - 排序方向：'pull'（父节点优先）或 'push'（子节点优先）
   * @returns 有序的 Repository 列表
   *
   * @example
   * ```typescript
   * // 获取 pull 顺序（父节点优先）
   * const pullOrder = rxdb.syncManager.getRepositorySyncOrder('pull');
   * // [User, Todo, Comment]
   *
   * // 获取 push 顺序（子节点优先）
   * const pushOrder = rxdb.syncManager.getRepositorySyncOrder('push');
   * // [Comment, Todo, User]
   * ```
   */
  getRepositorySyncOrder(direction: SortDirection): RepositoryIdentifier[] {
    const graph = this.getRepositoryDependencyGraph();
    return topologicalSort(graph, direction);
  }

  /**
   * 执行一次 pull，并按它的实际覆盖范围结算「远端待拉」计数
   *
   * @param options - 拉取选项
   * @returns 拉取结果
   *
   * @remarks
   * {@link SyncManager.pull} 和 {@link SyncManager.sync} 都要走这里。此前 `pull()` 无条件 `resetPullableCount()`
   * ——分页、逐仓过滤、有仓库失败时同样归零，界面显示「已经拉干净了」而远端还有一堆；
   * `sync` 则压根不结算，同步完计数原地不动。两条路径的口径互相矛盾。
   *
   * 令牌在发起 pull 之前签发：拉取期间到达的远端事件描述的是快照之后的新变更，
   * 结算时必须能看出来，否则「完整同步」的归零会把它们一起吞掉。
   */
  async #pullAndSettle(options?: PullOptions): Promise<PullResult> {
    const token = this.history.beginPullableSettlement();
    let result: PullResult;

    try {
      result = await pull(this, options);
    } catch (error) {
      // 部分成功也以异常形式抛出（RxDBPartialSyncError），已落库的那部分照实扣掉；
      // 其余异常一条都没拉到，扣 0 —— 但令牌仍要收回，否则代次永远停在旧值。
      const partial = error instanceof RxDBPartialSyncError ? (error.result as PullResult) : undefined;
      this.history.settleAbortedPull(token, partial ? partial.pulled : 0);
      throw error;
    }

    this.history.settlePull(token, options, result);

    return result;
  }
}

import { firstValueFrom, Subscription } from 'rxjs';
import { EntityType } from '../entity/entity.interface.js';
import { RestoreEntityOptions } from '../rxdb-adapter.js';
import {
  ENTITY_LOCAL_CREATE_EVENT,
  EntityLocalCreatedEvent,
  MergeBranchBeginEvent,
  MergeBranchCommitEvent,
  MergeBranchFailedEvent,
  SwitchBranchBeginEvent,
  SwitchBranchCommitEvent,
  SwitchBranchRollbackEvent,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK
} from '../rxdb-events.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import { LocalRxDBBranchRepository, LocalRxDBChangeRepository } from '../system/types.local.js';
import { RemoteRxDBBranchRepository, RemoteRxDBChangeRepository } from '../system/types.remote.js';
import { bulkSync, type BulkSyncOptions, type BulkSyncResult } from './bulk-sync.js';
import { checkRepositoryUpdates, type CheckRepositoryUpdatesResult } from './check-repository-updates.js';
import { cleanupExpired, type CleanupExpiredOptions, type CleanupExpiredResult } from './cleanup-expired.js';
import { create_branch } from './create-branch.js';
import { buildDependencyGraph, type DependencyGraph, type RepositoryIdentifier } from './dependency-graph.js';
import { getAllRepositorySyncStatus, type GetAllRepositorySyncStatusFilter } from './get-all-repository-sync-status.js';
import { getRepositorySyncStatus, type RepositorySyncStatus } from './get-repository-sync-status.js';
import { HistoryManager } from './HistoryManager.js';
import { merge_branch } from './merge-branch.js';
import { pullRepository, type PullRepositoryOptions, type PullRepositoryResult } from './pull-repository.js';
import { pull } from './pull.js';
import { isCompletePull } from './pullable-count.js';
import { PushInFlightRegistry } from './push-inflight.js';
import { pushRepository, type PushRepositoryOptions, type PushRepositoryResult } from './push-repository.js';
import { push } from './push.js';
import { remove_branch } from './remove-branch.js';
import { resolve_current_branch } from './resolve-current-branch.js';
import { restore_entity } from './restore-entity.js';
import { switch_branch_actions } from './switch-branch-actions.js';
import { syncBranches, type SyncBranchesResult } from './sync-branches.js';
import { isIgnorableDetachedVersionEventError, setupVersionSyncListeners } from './sync-listeners.js';
import { syncRepository, type SyncRepositoryOptions, type SyncRepositoryResult } from './sync-repository.js';
import { topologicalSort, type SortDirection } from './topological-sort.js';
import { getEarliestRecordAt, getRxDBChangeEventId, hasSyncedData, partialResultOf } from './version-manager.utils.js';
import {
  HistoryScopeAPI,
  MergeBranchOptions,
  MergeBranchResult,
  PullOptions,
  PullResult,
  PushOptions,
  PushResult,
  SyncResult
} from './VersionManager.interface.js';

/**
 * 版本管理器
 *
 * 负责管理数据库的分支、撤销/重做功能和版本历史
 * 核心功能包括：
 * - 分支管理（创建、删除、切换）
 * - 撤销/重做操作（数据库级别）
 * - Redo 栈的自动失效（当有新操作时）
 * - pull/push 同步到本地缓存
 */

export class VersionManager {
  #event_removers: Array<() => void> = [];
  #subscriptions: Subscription[] = [];
  #transactionDepth = 0;
  #transactionGeneration: number | null = null;
  #transactionCleanupInitialized = false;
  #historyManagerDestroyed = false;

  /**
   * 撤销/重做辅助类
   * 管理历史记录和内存 redo 栈
   */
  private historyManager: HistoryManager;

  /**
   * 「哪些变更此刻正在飞往远端」的登记处。
   *
   * @remarks
   * push 与 undo 唯一的会合点。push 在远端往返之前认领区间，undo 把认领区间当成已推 ——
   * 没有它，往返窗口内的一次撤销会造成本地与远端永久分叉，见 {@link PushInFlightRegistry}。
   *
   * 挂在 `VersionManager` 上是因为两边都只经它相遇：`pushRepository(vm, …)` 直接拿到它，
   * `HistoryManager` 经 `rxdb.versionManager` 拿到它。生命周期跟随实例，不跨实例共享。
   *
   * @internal
   */
  readonly pushInFlight = new PushInFlightRegistry();

  /**
   * 可 push 的变更数量流
   *
   * 实时追踪本地未推送的有效变更数量：
   * - 排除已撤销的变更（revertChangeId != null）
   * - 排除从远程 pull 来的变更（remoteId != null）
   */
  get pushableCount$() {
    return this.historyManager.pushableCount$;
  }

  /**
   * 远程待 pull 的变更数量流
   *
   * 通过监听远程事件（INSERT/UPDATE/DELETE）累计：
   * - 收到远程变更事件时计数+1
   * - pull 完成后计数重置为 0
   *
   * 用于 UI 显示"有 N 条远程更新可拉取"
   */
  get pullableCount$() {
    return this.historyManager.pullableCount$;
  }

  constructor(public readonly rxdb: RxDB) {
    this.historyManager = new HistoryManager(this.rxdb);
  }

  init() {
    if (this.#historyManagerDestroyed) {
      this.historyManager = new HistoryManager(this.rxdb);
      this.#historyManagerDestroyed = false;
    }

    const onTransactionBegin = () => {
      if (!this.#transactionCleanupInitialized) {
        this.#transactionCleanupInitialized = true;
        const onTransactionCommit = () => {
          if (this.#transactionDepth > 1) {
            this.#transactionDepth -= 1;
            return;
          }
          this.#transactionDepth = 0;
          this.#transactionGeneration = null;
        };
        const onTransactionRollback = () => {
          this.#transactionDepth = 0;
          this.#transactionGeneration = null;
        };
        this.rxdb.addEventListener(TRANSACTION_COMMIT, onTransactionCommit);
        this.rxdb.addEventListener(TRANSACTION_ROLLBACK, onTransactionRollback);
        this.#event_removers.push(
          () => this.rxdb.removeEventListener(TRANSACTION_COMMIT, onTransactionCommit),
          () => this.rxdb.removeEventListener(TRANSACTION_ROLLBACK, onTransactionRollback)
        );
      }
      if (this.#transactionDepth === 0) {
        this.#transactionGeneration = this.historyManager.undoSessionGeneration;
      }
      this.#transactionDepth += 1;
    };
    this.rxdb.addEventListener(TRANSACTION_BEGIN, onTransactionBegin);
    this.#event_removers.push(() => this.rxdb.removeEventListener(TRANSACTION_BEGIN, onTransactionBegin));

    // 监听 ENTITY_LOCAL_CREATE_EVENT 事件，自动失效 redo 栈（标准 undo/redo 语义）
    // 当用户在 undo 后执行新操作时，所有可重做的历史项将被标记为失效
    //
    // 契约：本处**有意不过滤** `data.origin === 'cross-tab'`。
    // 网关会给跨 tab 转发的实体打 `origin: 'cross-tab'`（见 `gateway/RxDBTabsGateway.ts`），
    // `rxdb-plugin-workspace` 在 NEW 事件上读它来防广播成环；但 version 子系统**不读**。
    // 理由：多 tab 共享同一份本地存储（同 dbName / OPFS），他 tab 的新写入对本 tab 而言
    // 同样让 redo 栈失效、同样可能恢复 undo 边界——按本地写入处理才是正确语义。
    const onLocalCreate = (event: EntityLocalCreatedEvent) => {
      const rxdbChanges = event.entities?.filter(e => e.namespace === 'rxdb' && e.entity === 'RxDBChange') ?? [];
      if (rxdbChanges.length > 0) {
        // 只有在非 undo/redo 操作时才失效 redo 栈
        if (!this.historyManager.isExecutingUndoRedo()) {
          const changeIds = rxdbChanges.flatMap(change => {
            const changeId = getRxDBChangeEventId(change);
            return changeId === null ? [] : [changeId];
          });
          // 带上 id：变更表通知可能跨进程迟到（Tauri stdio 宿主），时间窗守卫挡不住，
          // 由 invalidateRedoStack 按序列水位判定是否真是 undo 之后的新写入
          this.#runDetachedEventTask(this.historyManager.invalidateRedoStack(changeIds), 'invalidateRedoStack');
          const recordAt = getEarliestRecordAt(rxdbChanges);
          if (this.#transactionGeneration !== null || recordAt !== null) {
            this.historyManager.resetSyncCleared(changeIds, {
              generation: this.#transactionGeneration,
              recordAt
            });
          } else {
            this.historyManager.resetSyncCleared(changeIds);
          }
        }
      }
    };
    this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, onLocalCreate);
    this.#event_removers.push(() => this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, onLocalCreate));

    this.#init_sync();
  }

  destroy() {
    if (this.#historyManagerDestroyed) return;
    this.#historyManagerDestroyed = true;
    this.historyManager.destroy();
    for (const remove of this.#event_removers) {
      remove();
    }
    this.#event_removers.length = 0;
    for (const sub of this.#subscriptions) {
      sub.unsubscribe();
    }
    this.#subscriptions.length = 0;
    this.#transactionDepth = 0;
    this.#transactionGeneration = null;
    this.#transactionCleanupInitialized = false;
  }

  resetSessionState() {
    // 整个连接的历史上下文都作废了，不只是当前分支
    this.historyManager.clearAllUndoHistory();
    this.historyManager.resetPullableCount();
  }

  /**
   * 创建新分支
   * @param branchId 分支 id
   * @param fromChangeId 从哪个 changeId 创建新分支
   */
  async createBranch(branchId: string, fromChangeId?: number): Promise<InstanceType<typeof RxDBBranch>> {
    return create_branch(this, branchId, fromChangeId);
  }

  /**
   * 删除分支
   * @param branchId 分支 id
   */
  async removeBranch(branchId: string): Promise<void> {
    return remove_branch(this, branchId);
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
   * const result = await rxdb.versionManager.syncBranches();
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
   * const result = await rxdb.versionManager.pull();
   * console.log(`Pulled ${result.pulled} changes`);
   *
   * // 拉取所有数据
   * const result = await rxdb.versionManager.pull({ fetchAll: true });
   * ```
   */
  async pull(options?: PullOptions): Promise<PullResult> {
    let result: PullResult;
    try {
      result = await this.historyManager.syncing(() => this.#pullAndSettle(options));
    } catch (error) {
      // repositoryFilter 逐仓拉取时，前面的仓库可能已经真实落库
      // 随后某个仓库失败会抛 RxDBPartialSyncError。此前这里直接 rethrow，
      // undo 边界从未按已提交的部分推进，用户仍能 undo 到「合并前」的内容，
      // 与已落库的远端数据产生分叉。
      if (error instanceof RxDBPartialSyncError && (error.result as PullResult).historyInvalidated) {
        this.historyManager.clearUndoHistory();
      }
      throw error;
    }

    // 远端变更改写了本地实体数据时才清空 undo/redo 历史：已与远程合并，无法 undo 合并前的内容。
    // 判据是 historyInvalidated 而非 pulled —— 拉回来的变更可能被压缩全部抵消，
    // 一条实体数据都没动，此时历史边界仍然有效。
    if (result.historyInvalidated) {
      this.historyManager.clearUndoHistory();
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
   * const result = await rxdb.versionManager.push();
   * console.log(`Pushed ${result.pushed} changes`);
   *
   * // 自定义批量大小
   * const result = await rxdb.versionManager.push({ batchSize: 500 });
   * ```
   */
  async push(options?: PushOptions): Promise<PushResult> {
    const result = await this.historyManager.syncing(() => push(this, options));

    // 当 push 有数据变更时，清空 undo/redo 历史
    // 因为已与远程合并，无法 undo 合并前的内容
    if (result.pushed > 0) {
      this.historyManager.clearUndoHistory();
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
   * const result = await rxdb.versionManager.sync();
   * console.log(`Pulled ${result.pullResult.pulled}, Pushed ${result.pushResult.pushed}`);
   * ```
   */
  async sync(options?: { pull?: PullOptions; push?: PushOptions }): Promise<SyncResult> {
    const result = await this.historyManager.syncing(async () => {
      // 先 pull 再 push
      const pullResult = await this.#pullAndSettle(options?.pull);
      const pushResult = await push(this, options?.push);

      return { pullResult, pushResult };
    });

    // 当 pull 改写了实体数据、或 push 有上行时，清空 undo/redo 历史
    // 因为已与远程合并，无法 undo 合并前的内容
    if (result.pullResult.historyInvalidated || result.pushResult.pushed > 0) {
      this.historyManager.clearUndoHistory();
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
   * const result = await rxdb.versionManager.pullRepository('public', 'Todo', {
   *   includeRelated: true // 默认：若 Todo 有外键则自动拉取 User
   * });
   *
   * // 不级联拉取
   * const result = await rxdb.versionManager.pullRepository('public', 'Todo', {
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
      result = await this.historyManager.syncing(() => pullRepository(this, namespace, entity, options));
    } catch (error) {
      // fetchAll 多轮拉取中途失败时，前面几轮的事务已经真实提交
      // 会抛 RxDBPartialSyncError 而非裸错误。此前这里直接 rethrow，undo 边界
      // 从未按已提交的部分推进，用户仍能 undo 到「合并前」的内容。
      if (error instanceof RxDBPartialSyncError && (error.result as PullRepositoryResult).historyInvalidated) {
        this.historyManager.clearUndoHistory();
      }
      throw error;
    }

    // 有实体数据被改写时清空 undo/redo 历史（级联依赖仓的改写也算在内）
    if (result.historyInvalidated) {
      this.historyManager.clearUndoHistory();
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
   * const result = await rxdb.versionManager.pushRepository('public', 'User', {
   *   includeRelated: true // 默认：若 Post 引用 User 则自动推送 Post
   * });
   *
   * // 不级联推送
   * const result = await rxdb.versionManager.pushRepository('public', 'User', {
   *   includeRelated: false // 仅推送 User，依赖数据可能不完整
   * });
   * ```
   */
  async pushRepository(
    namespace: string,
    entity: string,
    options?: PushRepositoryOptions
  ): Promise<PushRepositoryResult> {
    const result = await this.historyManager.syncing(() => pushRepository(this, namespace, entity, options));

    // 有数据变更时清空 undo/redo 历史
    if (result.pushed > 0) {
      this.historyManager.clearUndoHistory();
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
   * const result = await rxdb.versionManager.syncRepository('public', 'Todo');
   * console.log(`Pulled ${result.pullResult.pulled}, Pushed ${result.pushResult.pushed}`);
   *
   * // 自定义 pull 和 push 选项
   * const result = await rxdb.versionManager.syncRepository('public', 'Todo', {
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
    const result = await this.historyManager.syncing(() => syncRepository(this, namespace, entity, options));

    // 有数据变更时清空 undo/redo 历史
    if (result.pullResult.historyInvalidated || result.pushResult.pushed > 0) {
      this.historyManager.clearUndoHistory();
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
   * const { removed } = await rxdb.versionManager.cleanupExpired('public', 'Order', {
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
   * const result = await rxdb.versionManager.checkRepositoryUpdates('public', 'Todo');
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
   * const status = await rxdb.versionManager.getRepositorySyncStatus('public', 'Todo');
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
   * const statuses = await rxdb.versionManager.getAllRepositorySyncStatus();
   *
   * // 仅获取有待处理变更的 Repository
   * const pending = await rxdb.versionManager.getAllRepositorySyncStatus({
   *   hasPendingChanges: true
   * });
   *
   * // 仅获取已启用的全量同步 Repository
   * const fullSync = await rxdb.versionManager.getAllRepositorySyncStatus({
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
    const token = this.historyManager.beginPullableSettlement();
    const statuses = await getAllRepositorySyncStatus(this.rxdb);
    const count = statuses.reduce((total, status) => total + (status.enabled ? status.pullableCount : 0), 0);
    this.historyManager.reconcilePullableCount(token, count);
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
   * const result = await rxdb.versionManager.bulkSync();
   * console.log(`成功: ${result.succeeded}，失败: ${result.failed}`);
   *
   * // 同步指定 Repository
   * const result = await rxdb.versionManager.bulkSync({
   *   repositories: [
   *     { namespace: 'public', entity: 'Todo' },
   *     { namespace: 'public', entity: 'User' }
   *   ]
   * });
   *
   * // 并发模式仅 pull
   * const result = await rxdb.versionManager.bulkSync({
   *   concurrent: true,
   *   concurrency: 3,
   *   push: false
   * });
   *
   * // 检查每项结果
   * for (const item of result.results) {
   *   if (item.success) {
   *     console.log(`${item.repository.entity}: 已拉取 ${item.result.pull?.pulled || 0} 条`);
   *   } else {
   *     console.error(`${item.repository.entity}: ${item.error.message}`);
   *   }
   * }
   * ```
   */
  async bulkSync(options?: BulkSyncOptions): Promise<BulkSyncResult> {
    const result = await this.historyManager.syncing(() => bulkSync(this.rxdb, options));

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
      this.historyManager.clearUndoHistory();
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
   * const graph = rxdb.versionManager.getRepositoryDependencyGraph();
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
   * const pullOrder = rxdb.versionManager.getRepositorySyncOrder('pull');
   * // [User, Todo, Comment]
   *
   * // 获取 push 顺序（子节点优先）
   * const pushOrder = rxdb.versionManager.getRepositorySyncOrder('push');
   * // [Comment, Todo, User]
   * ```
   */
  getRepositorySyncOrder(direction: SortDirection): RepositoryIdentifier[] {
    const graph = this.getRepositoryDependencyGraph();
    return topologicalSort(graph, direction);
  }

  // 分支管理。

  /**
   * 切换到指定分支
   *
   * @param branchId - 目标分支 ID
   *
   * @remarks
   * 切换分支后会自动清空 redo 栈，因为 redo 历史在新分支中不再有效。
   * 如果目标分支与当前分支相同，则直接返回，避免不必要的操作。
   */
  async switchBranch(branchId: string): Promise<void> {
    const currentBranch = await this.getCurrentBranch();
    // 若切换到相同分支则直接返回，避免不必要操作
    if (currentBranch?.id === branchId) {
      return;
    }
    let switchCommitted = false;
    try {
      this.rxdb.dispatchEvent(new SwitchBranchBeginEvent(branchId));
      const { adapter } = await this.getLocalRepositories();
      const actions = await switch_branch_actions(this, branchId);
      const result = await adapter.switchBranch({
        branchId: branchId,
        actions
      });
      // 适配器的 switchBranch 内部包了事务（见各适配器 version/switch_branch.ts），
      // 走到这里说明已提交。此后任何失败都不该再发 Rollback —— 分支确实切过去了。
      switchCommitted = true;

      // 切换分支后清理状态：
      // 1. 清空 redo 栈，因为 redo 历史在新分支中不再有效
      // 2. 更新当前分支ID和历史起始时间为切换时刻
      this.historyManager.clearRedoStack();
      // undo session 是按分支存的，这里同步切视图。否则要等 current_branch$
      // 这条响应式查询补发，切换后紧接着的 undo() 会撞上中途换 session 的竞态。
      this.historyManager.setUndoBranch(branchId);

      this.rxdb.dispatchEvent(new SwitchBranchCommitEvent(branchId));
      return result;
    } catch (error) {
      if (!switchCommitted) {
        this.rxdb.dispatchEvent(new SwitchBranchRollbackEvent(branchId));
      }
      throw error;
    }
  }

  /**
   * 合并分支
   *
   * 将源分支的变更合并到当前激活分支（目标分支）。
   *
   * @param sourceBranchId - 源分支 ID
   * @param options - 合并选项
   * @returns 合并结果
   *
   * @remarks
   * 支持两种策略：
   * - `squash`（默认）：将源分支所有变更压缩为最小操作集后一次性应用，目标分支只产生一组变更记录
   * - `normal`：逐条应用源分支变更，每条变更在目标分支产生独立的变更记录（保留历史细节）
   *
   * 合并后会清空 undo/redo 历史，因为合并操作不可逆。
   * 可选通过 `deleteSource: true` 在合并后删除源分支。
   *
   * @example
   * ```typescript
   * // 压缩合并（默认）
   * const result = await rxdb.versionManager.mergeBranch('feature-x');
   * console.log(`Merged ${result.merged} changes`);
   *
   * // 普通合并
   * const result = await rxdb.versionManager.mergeBranch('feature-x', {
   *   strategy: 'normal'
   * });
   *
   * // 合并后删除源分支
   * const result = await rxdb.versionManager.mergeBranch('feature-x', {
   *   deleteSource: true
   * });
   * ```
   */
  async mergeBranch(sourceBranchId: string, options?: MergeBranchOptions): Promise<MergeBranchResult> {
    const currentBranch = await this.getCurrentBranch();
    if (!currentBranch) {
      throw new RxDBError('No active branch found');
    }
    const targetBranchId = currentBranch.id;
    try {
      this.rxdb.dispatchEvent(new MergeBranchBeginEvent(sourceBranchId, targetBranchId));

      const result = await merge_branch(this, sourceBranchId, targetBranchId, options);

      // 合并有变更时清空 undo/redo 历史
      if (result.merged > 0) {
        this.historyManager.clearUndoHistory();
      }

      this.rxdb.dispatchEvent(new MergeBranchCommitEvent(sourceBranchId, targetBranchId));
      return result;
    } catch (error) {
      this.rxdb.dispatchEvent(new MergeBranchFailedEvent(sourceBranchId, targetBranchId));
      throw error;
    }
  }

  /**
   * 获取特定作用域的历史记录 API
   *
   * @param options - 作用域选项：
   *   - 不传参数 → database 作用域（整个数据库）
   *   - EntityType 类 → repository 作用域（该实体的所有记录）
   *   - 实体实例 → entity 作用域（该实例的历史）
   * @returns 统一的历史记录 API 接口
   *
   * @example
   * ```ts
   * // 数据库级别
   * const dbHistory = versionManager.history();
   *
   * // 仓库级别（所有 User 记录）
   * const userHistory = versionManager.history(User);
   *
   * // 实体级别（单个用户）
   * const entityHistory = versionManager.history(userInstance);
   * ```
   */
  history<T extends EntityType>(options?: T | InstanceType<T>): HistoryScopeAPI {
    return this.historyManager.history(options);
  }

  /**
   * 恢复被删除的实体
   *
   * 根据 RxDBChange 记录中的 inversePatch 重新插入实体，
   * 恢复操作本身会生成新的 RxDBChange 记录（可被 push 到远程）。
   *
   * @param entity - 被删除的实体实例（需要包含 metadata 信息）
   * @param options - 恢复选项，包含 changeId（DELETE 类型的 RxDBChange 记录 ID）
   * @returns 恢复后的实体实例
   */
  async restoreEntity<T extends EntityType>(
    entity: InstanceType<T>,
    options: RestoreEntityOptions
  ): Promise<InstanceType<T>> {
    return restore_entity(this, entity, options);
  }

  async getLocalRepositories() {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const branchRepository = adapter.getRepository<typeof RxDBBranch, LocalRxDBBranchRepository>(RxDBBranch);
    const changeRepository = adapter.getRepository<typeof RxDBChange, LocalRxDBChangeRepository>(RxDBChange);
    return { branchRepository, changeRepository, adapter };
  }

  async getRemoteRepositories() {
    const adapter = await firstValueFrom(this.rxdb.remoteAdapter$);
    const branchRepository = adapter.getRepository<typeof RxDBBranch, RemoteRxDBBranchRepository>(RxDBBranch);
    const changeRepository = adapter.getRepository<typeof RxDBChange, RemoteRxDBChangeRepository>(RxDBChange);
    return { branchRepository, changeRepository, adapter };
  }

  /**
   * 取当前分支；没有激活分支时激活（或新建）`main`。
   *
   * @remarks
   * 分两段是有意的：
   *
   * - **热路径**（已有激活分支）不开事务。同步链路里每条远端事件都要调它
   *   （`sync-listeners` 的 `filterByBranch`），把整段包进事务能修好并发，
   *   但会让每次读都去抢并发度 1 的写队列槽位。
   * - **冷路径**（查不到激活分支）才开事务，并在事务内**重做一遍检查**（双重检查）。
   * 否则两个并发调用会双双走到 `create`，第二个撞主键报错。
   */
  async getCurrentBranch() {
    const { branchRepository, adapter } = await this.getLocalRepositories();
    const activeBranch = (
      await branchRepository.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'activated', operator: '=', value: true }]
        },
        limit: 1
      })
    )[0];

    if (activeBranch) {
      return activeBranch;
    }

    return adapter.transaction(async executor =>
      resolve_current_branch(executor.getRepository(RxDBBranch) as unknown as LocalRxDBBranchRepository, this.rxdb)
    );
  }

  /**
   * 执行一次 pull，并按它的实际覆盖范围结算「远端待拉」计数
   *
   * @param options - 拉取选项
   * @returns 拉取结果
   *
   * @remarks
   * {@link pull} 和 {@link sync} 都要走这里。此前 `pull()` 无条件 `resetPullableCount()`
   * ——分页、逐仓过滤、有仓库失败时同样归零，界面显示「已经拉干净了」而远端还有一堆；
   * `sync` 则压根不结算，同步完计数原地不动。两条路径的口径互相矛盾。
   *
   * 令牌在发起 pull 之前签发：拉取期间到达的远端事件描述的是快照之后的新变更，
   * 结算时必须能看出来，否则「完整同步」的归零会把它们一起吞掉。
   */
  async #pullAndSettle(options?: PullOptions): Promise<PullResult> {
    const token = this.historyManager.beginPullableSettlement();
    let result: PullResult;

    try {
      result = await pull(this, options);
    } catch (error) {
      // 部分成功也以异常形式抛出（RxDBPartialSyncError），已落库的那部分照实扣掉；
      // 其余异常一条都没拉到，扣 0 —— 但令牌仍要收回，否则代次永远停在旧值。
      const partial = error instanceof RxDBPartialSyncError ? (error.result as PullResult) : undefined;
      this.historyManager.settlePullableCount(token, { complete: false, pulled: partial ? partial.pulled : 0 });
      throw error;
    }

    this.historyManager.settlePullableCount(token, {
      complete: isCompletePull(options, result),
      pulled: result.pulled
    });

    return result;
  }

  #init_sync() {
    // 委托给 sync-listeners.ts 完成 connected$ 自动同步 + Remote 事件累计逻辑
    const { subscriptions, removers } = setupVersionSyncListeners(this, this.historyManager);
    this.#subscriptions.push(...subscriptions);
    this.#event_removers.push(...removers);
  }

  #runDetachedEventTask(task: Promise<void>, label: string) {
    void task.catch(error => {
      if (isIgnorableDetachedVersionEventError(error)) {
        return;
      }
      console.error(`[VersionManager] ${label} failed:`, error);
    });
  }
}

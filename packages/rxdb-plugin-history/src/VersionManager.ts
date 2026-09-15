import {
  ENTITY_LOCAL_CREATE_EVENT,
  EntityLocalCreatedEvent,
  EntityType,
  getCurrentBranch,
  getLocalSystemRepositories,
  getRemoteSystemRepositories,
  HistoryScopeAPI,
  MergeBranchBeginEvent,
  MergeBranchCommitEvent,
  MergeBranchFailedEvent,
  MergeBranchOptions,
  MergeBranchResult,
  RestoreEntityOptions,
  RxDB,
  RxDBBranch,
  RxDBError,
  SwitchBranchBeginEvent,
  SwitchBranchCommitEvent,
  SwitchBranchRollbackEvent,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK
} from '@aiao/rxdb';
import { create_branch } from './create-branch.js';
import { isIgnorableDetachedVersionEventError } from './detached-event-error.js';
import { HistoryManager } from './HistoryManager.js';
import { merge_branch } from './merge-branch.js';
import { PushInFlightRegistry } from './push-inflight.js';
import { remove_branch } from './remove-branch.js';
import { restore_entity } from './restore-entity.js';
import { switch_branch_actions } from './switch-branch-actions.js';
import { createSyncHistoryBridge, type SyncHistoryBridge } from './sync-history-bridge.js';
import { getEarliestRecordAt, getRxDBChangeEventId } from './version-manager.utils.js';
/**
 * 版本管理器
 *
 * 负责管理数据库的分支、撤销/重做与版本历史：
 * - 分支管理（创建、删除、切换、合并）
 * - 撤销/重做操作（数据库级别）
 * - Redo 栈的自动失效（当有新操作时）
 *
 * @remarks
 * 推拉同步**不在**这里。US-025 阶段 D 之后它住在 `@aiao/rxdb-plugin-sync` 的
 * `SyncManager` 上，两边只经 {@link VersionManager.syncBridge} 这一张窄接口相遇。
 */

export class VersionManager {
  #event_removers: Array<() => void> = [];
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
   * 交给同步插件的那一小块历史能力。
   *
   * @remarks
   * 传闭包而不是 `this.historyManager`：`init()` 会在断连重连后重建管理器，
   * 桥必须每次现取，见 {@link createSyncHistoryBridge}。
   *
   * @internal
   */
  readonly syncBridge: SyncHistoryBridge = createSyncHistoryBridge(() => this.historyManager, this.pushInFlight);

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
  }

  destroy() {
    if (this.#historyManagerDestroyed) return;
    this.#historyManagerDestroyed = true;
    this.historyManager.destroy();
    for (const remove of this.#event_removers) {
      remove();
    }
    this.#event_removers.length = 0;
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
    return getLocalSystemRepositories(this.rxdb);
  }

  async getRemoteRepositories() {
    return getRemoteSystemRepositories(this.rxdb);
  }

  /**
   * 取当前分支；没有激活分支时激活（或新建）`main`。
   *
   * @remarks
   * 分两段是有意的：
   *
   * - **热路径**（已有激活分支）不开事务。同步插件的远端事件链路里每条事件都要调它
   *   （`sync-listeners` 的 `filterByBranch`），把整段包进事务能修好并发，
   *   但会让每次读都去抢并发度 1 的写队列槽位。
   * - **冷路径**（查不到激活分支）才开事务，并在事务内**重做一遍检查**（双重检查）。
   * 否则两个并发调用会双双走到 `create`，第二个撞主键报错。
   */
  async getCurrentBranch() {
    return getCurrentBranch(this.rxdb);
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

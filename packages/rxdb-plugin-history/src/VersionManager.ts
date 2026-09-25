import {
  declareTrustedWrite,
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
  takeDeclaredWrite,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK,
  TrustedWriteIntent,
  type RxDBAdapterLocalBase,
  type RxDBBranchSwitchPreconditions,
  type TransactionExecutor
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

  /**
   * @param rxdb - 宿主实例
   *
   * @remarks
   * 构造即建 {@link HistoryManager}，而它在自己的构造器里就订阅了活跃分支流 ——
   * 所以「造出来」本身已经是一次资源获取，调用方必须把 {@link VersionManager.destroy}
   * 登记在作用域上，哪怕后面的 {@link VersionManager.init} 还没跑。
   */
  constructor(public readonly rxdb: RxDB) {
    this.historyManager = new HistoryManager(this.rxdb);
  }

  /**
   * 挂上事务与本地写入的事件监听，开始记历史。
   *
   * @remarks
   * 与 {@link VersionManager.destroy} 成对，可重入：上一轮 `destroy()` 过的
   * `HistoryManager` 已经拆掉了订阅，这里重建一个而不是复用 —— 复用等于把新纪元的
   * 变更喂给一条已 complete 的流。
   *
   * 不发任何适配器读写，因此可以（也必须）早于引导链跑：`HistoryManager` 的分支流
   * 要赶在第一条 `rxdb_change` 事件之前订阅上，装晚了那一批变更就不进历史。
   */
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

  /**
   * 摘掉全部事件监听与订阅，并销毁 {@link HistoryManager}。
   *
   * @remarks
   * 幂等。事务深度与代次一并清零：拆卸可能发生在事务中途，留着计数会让下一个纪元
   * 以为自己开局就在一笔未结的事务里。
   */
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

  /**
   * 作废本连接积累的历史上下文：清空全部分支的 undo 会话与待拉计数。
   *
   * @remarks
   * 供切库 / 重连这类「本地数据整体换了一份」的场景调用。清的是**全部**分支而不只是
   * 当前分支 —— 换掉的是整个数据源，其它分支上那些 undo 条目指向的行同样已经不在了。
   */
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
   * @param preconditions - 【可选】切换前要成立的条件；不传时行为与以往逐字节一致
   *
   * @remarks
   * 切换分支后会自动清空 redo 栈，因为 redo 历史在新分支中不再有效。
   * 如果目标分支与当前分支相同，则直接返回，避免不必要的操作。
   *
   * 第二形参是**纯扩展**：既有调用点一个都不用改，不传即不表态。做成默认开启的话，
   * `switchBranch(id)` 会在任何有未提交改动的库上开始抛错——而历史子系统自己就在调它
   * （undo/redo 回放、redo 失效），那些路径上工作树恒非空，默认开启等于让 undo 在有改动时不可用。
   *
   * 条件由**能力插件**校验，本方法一个字段都不读：判据是
   * `@aiao/rxdb-plugin-working-tree` 贡献的那几张表，这里既不认识也不该认识它们。
   * 反方向（本包 import 那个插件）是条依赖环，nx 的图插件会把 `run-many` 当场拒掉。
   */
  async switchBranch(branchId: string, preconditions?: RxDBBranchSwitchPreconditions): Promise<void> {
    const currentBranch = await this.getCurrentBranch();
    // 若切换到相同分支则直接返回，避免不必要操作
    if (currentBranch?.id === branchId) {
      return;
    }
    let switchCommitted = false;
    // 声明挂在**适配器实例**上、取用即清除；下面的 catch 要靠它原路清掉。
    let declaredAdapter: RxDBAdapterLocalBase | undefined;
    // 适配器是否真的调了 prepare。见下方「没调用就抛」那一段。
    let prepared = false;
    try {
      this.rxdb.dispatchEvent(new SwitchBranchBeginEvent(branchId));
      // 问一句这次切换要不要整个交给某个能力贡献方（见 RxDBSystemContribution.takeOverBranchSwitch）。
      // 排在 `getLocalRepositories()` **之前**：接管方自己解析适配器、自己开事务，这里先取一个
      // 出来只是让它在接管路径上白白闲置一个纪元引用。
      if (await this.#take_over_branch_switch(currentBranch?.id ?? null, branchId, preconditions)) {
        // 接管方已经把 active 切过去了（它自己的事务已提交），此后与普通路径同一个状态。
        switchCommitted = true;
        this.#settle_switched(branchId);
        return;
      }
      const { adapter } = await this.getLocalRepositories();
      const actions = await switch_branch_actions(this, branchId);
      // 切分支重写的是实体表的**投影**，不是用户的编辑：矩阵行 4 要求它不产生工作树单元。
      // 不声明的话挂载点只看见「有人在调 switchBranch」，与 undo/redo（行 6，必须产生单元）
      // 完全同形，切一次分支就会把整批物化写记成一批未提交变更。
      declareTrustedWrite(adapter, {
        file: 'VersionManager.ts',
        symbol: 'switchBranch',
        intent: TrustedWriteIntent.branch_materialization
      });
      declaredAdapter = adapter;
      const result = await adapter.switchBranch({
        branchId: branchId,
        actions,
        // 前置校验跑在切换事务**内部**（见 #prepare_branch_switch）。`targetBranchId` 用
        // 适配器解析出来的那一个而不是这里的 `branchId`：省略分支的调用点上只有它是对的。
        prepare: async ({ executor, targetBranchId }) => {
          prepared = true;
          await this.#prepare_branch_switch(executor, currentBranch?.id ?? null, targetBranchId, preconditions);
        }
      });
      // 适配器的 switchBranch 内部包了事务（见各适配器 version/switch_branch.ts），
      // 走到这里说明已提交。此后任何失败都不该再发 Rollback —— 分支确实切过去了。
      switchCommitted = true;

      this.#settle_switched(branchId);
      // 适配器吞掉 `prepare` 不会以任何别的方式显形：分支照切、actions 照套、事件照发，
      // 只是这一次切换没验过目标分支的提交图、没判过调用方提的条件、也没推进激活代际。
      // 上面那几步记账照做完 —— 分支确实切过去了，把内存视图留在旧分支只是再坏一件事；
      // 抛出只为一件事：不让这条契约违背被当成一次正常切换吞掉。
      if (!prepared) {
        throw new RxDBError(
          `适配器 ${adapter.constructor.name} 的 switchBranch 没有调用 options.prepare：` +
            `分支已经切到 ${branchId}，但这次切换一条前置条件都没校验过。` +
            '适配器必须在解析出目标分支之后、动第一行之前 await 它（见 rxdb-adapter.ts › SwitchBranchOptions.prepare）。'
        );
      }
      return result;
    } catch (error) {
      // 前置校验现在在事务内判，被拒是一条**日常**路径（工作树不干净就该拒），而那条路径上
      // 一个写原语都没跑过——声明还原封不动挂在适配器上。留着的话，这个适配器的下一次
      // mergeChanges 会把它取走，那次合并于是按 projection_rewrite 判定：一个工作树单元都不产生，
      // 拉回来的远端改动凭空消失。
      if (declaredAdapter) takeDeclaredWrite(declaredAdapter);
      if (!switchCommitted) {
        this.rxdb.dispatchEvent(new SwitchBranchRollbackEvent(branchId));
        // 诊断落盘排在**回滚之后**、重新抛出之前：判定失败发生在那次注定回滚的事务里，
        // 写在里面的标记会跟着一起消失（见 RxDBSystemContribution.settleBranchSwitchFailure）。
        // 只在没提交的那条路径上跑——切换已经成立之后的失败不是「没切成」。
        await this.#settle_branch_switch_failure(currentBranch?.id ?? null, branchId, error);
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

  /**
   * 取本地适配器上的系统表仓库。
   *
   * @returns `branchRepository` / `changeRepository` 与它们所属的本地适配器
   *
   * @remarks
   * 每次都经 `localAdapter$` 重新解析，不缓存：适配器随连接纪元换，缓下来的那一份
   * 会在重连之后指向已拆的旧实例。
   */
  async getLocalRepositories() {
    return getLocalSystemRepositories(this.rxdb);
  }

  /**
   * 取远端适配器上的系统表仓库。
   *
   * @returns `branchRepository` / `changeRepository` 与它们所属的远端适配器
   *
   * @remarks
   * 未配置远端时 `remoteAdapter$` 不发值，调用会一直挂着 —— 这是有意的：同步路径
   * 本来就只在配了远端时才走，返回一个空壳只会把「没配远端」推迟到更深的地方才报。
   */
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

  /**
   * 逐个问贡献方：这次切换能不能发生；能的话，把该在同一个事务里做掉的事做掉。
   *
   * @param executor - **切换事务本身**的执行器，由适配器经 `SwitchBranchOptions.prepare` 交过来
   * @param currentBranchId - 当前分支 id；一条 active 分支都没有时为 `null`
   * @param targetBranchId - 适配器解析之后的目标分支 id
   * @param preconditions - 调用方提出的条件；没提出时是 `undefined`
   *
   * @remarks
   * **跑在切换事务内部。** 它以前自己开一个只读事务、在 `adapter.switchBranch()` **之前**跑完：
   * 那个事务提交到切换事务开始之间是一段没有任何东西守着的窗口，窗口里的一次写能让刚判过的
   * 「工作树干净」重新变脏，而切换照样完成。搬进来之后，「校验通过」与「切换完成」不再是
   * 两件可以分开发生的事——同一个事务，要么一起成立，要么一起没发生。
   *
   * 代价是顺序反了过来：`switch_branch_actions()` 现在排在校验**之前**（它算出来的重放指令
   * 得先交给适配器才谈得上开事务），目标分支的链已知损坏时会白算一遍。那一遍只读不写，
   * 被拒时一行都还没动——拿一次白算换掉上面那段窗口。
   *
   * **每一次真正发生的切换上都跑，与调用方提没提条件无关。** 目标分支的提交图可达损坏
   * 与有没有 `preconditions` 无关（SC-013：三条入口各自返回 `commit_graph_corrupted`）；
   * 只在带选项时跑的话，日常那条不带选项的切换会一路切进一份重放不出来的历史。
   *
   * 「真正发生」是字面意思：A→A 的调用在 {@link VersionManager.switchBranch} 里就早返回了
   * （同文件上方的 `currentBranch?.id === branchId`），根本走不到这里。那条路径上没有要防的
   * 东西——分支没换，目标分支的历史也没有被重放，工作树连一行都不会动。把早返回去掉好让
   * 守卫「真的无条件」是反向的：切到当前分支会因为它自己的历史损坏而失败，而这次切换
   * 本来什么都不做。
   *
   * 串行而非 `Promise.all`：`executor` 是并发度为 1 的队列，并行发起只会让读取顺序取决于
   * 各贡献方内部 await 的排布。一个贡献方都没有时这里是一次空循环——没装能力插件的库上，
   * 这条扩展不多开事务、也不多发一条查询。
   */
  /**
   * 切换成立之后那几步与库无关的记账。
   *
   * @param branchId - 已经切过去的分支 id
   *
   * @remarks
   * 抽出来只为一件事：**接管路径与普通路径必须记同一笔账**。两处各抄一遍的那天，
   * 接管路径上漏掉的 `setUndoBranch()` 不会以任何形式报错——它只是让切换后紧接着的
   * 一次 `undo()` 撤到上一条分支的 session 上去。
   *
   * 三步的顺序是：redo 栈先清（它在新分支上不再有效），undo 视图再切（按分支存，
   * 等 `current_branch$` 补发会让紧接着的 `undo()` 撞上中途换 session 的竞态），
   * 事件最后发（订阅者醒来时这两样都该已经是新分支的）。
   */
  #settle_switched(branchId: string): void {
    this.historyManager.clearRedoStack();
    this.historyManager.setUndoBranch(branchId);
    this.rxdb.dispatchEvent(new SwitchBranchCommitEvent(branchId));
  }

  /**
   * 问各贡献方要不要接管这次切换，第一个答应的就停。
   *
   * @param currentBranchId - 当前分支 id
   * @param targetBranchId - 目标分支 id
   * @param preconditions - 调用方提出的前置条件
   * @returns 有人接管了就是 `true`，此时 active 已经切过去了
   *
   * @remarks
   * 问到第一个 `'switched'` 为止：两个贡献方都接管等于 active 被切两次，而第二次看到的
   * 现场已经是第一次的结果。串行的理由与 {@link VersionManager.#prepare_branch_switch} 同源。
   */
  async #take_over_branch_switch(
    currentBranchId: string | null,
    targetBranchId: string,
    preconditions: RxDBBranchSwitchPreconditions | undefined
  ): Promise<boolean> {
    for (const contribution of this.rxdb.systemContributions) {
      const verdict = await contribution.takeOverBranchSwitch({ currentBranchId, targetBranchId, preconditions });
      if (verdict === 'switched') return true;
    }
    return false;
  }

  /**
   * 切换事务回滚之后，让各贡献方落下自己的失败诊断。
   *
   * @param currentBranchId - 仍然 active 的那条分支
   * @param targetBranchId - 没切成的目标分支
   * @param error - 让这次切换失败的那个错误
   *
   * @remarks
   * 调用点在 `catch` 里，紧接着就要把 `error` 重新抛出去——所以贡献方那一侧带着一条
   * 「不得抛出」的硬契约（见 {@link RxDBSystemContribution.settleBranchSwitchFailure}）。
   * 这里**不**加 try/catch 替它兜：兜住就等于宣布这个契约可以不遵守，而真正被兜掉的那个
   * 异常从此没有任何一处会显形。
   */
  async #settle_branch_switch_failure(
    currentBranchId: string | null,
    targetBranchId: string,
    error: unknown
  ): Promise<void> {
    for (const contribution of this.rxdb.systemContributions) {
      await contribution.settleBranchSwitchFailure({ currentBranchId, targetBranchId, error });
    }
  }

  async #prepare_branch_switch(
    executor: TransactionExecutor,
    currentBranchId: string | null,
    targetBranchId: string,
    preconditions: RxDBBranchSwitchPreconditions | undefined
  ): Promise<void> {
    for (const contribution of this.rxdb.systemContributions) {
      await contribution.prepareBranchSwitch({ executor, currentBranchId, targetBranchId, preconditions });
    }
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

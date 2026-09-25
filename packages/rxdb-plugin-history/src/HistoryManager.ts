import {
  declareTrustedWrite,
  EntityType,
  HistoryItem,
  HistoryScope,
  HistoryScopeAPI,
  isAdapterShutdownError,
  REPOSITORY_SYNC_COMPLETE_EVENT,
  RxDB,
  RxDBBranch,
  RxDBChange,
  SKIP_BRANCH_SWITCH_PREPARE,
  TrustedWriteIntent
} from '@aiao/rxdb';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  EMPTY,
  filter,
  firstValueFrom,
  map,
  Observable,
  ReplaySubject,
  shareReplay,
  Subject,
  Subscription,
  switchMap,
  takeUntil
} from 'rxjs';
import { buildLastPushedMap, filterUndoableHistories } from './history-filters.js';
import { convertChangesToHistories } from './history-item-builder.js';
import { createHistoryScopeApi, type HistoryScopeApiHost } from './history-scope-api.js';
import {
  INITIAL_UNDO_BOUNDARY,
  type ActiveUndoSession,
  type UndoBoundary,
  type UndoSession,
  type UndoSessionEvent
} from './history-undo-session.types.js';
import { settledPullableCount } from './pullable-count.js';
import { RedoStack } from './redo-stack.js';
import { RxDBCrossScopeTransactionError, selectScopedHistories } from './scope-selection.js';
import { get_switch_version_actions } from './switch-branch-actions.js';
import {
  applyUndoRedoHistories,
  fetchLatestHistories,
  getLocalRxDBSyncRepository,
  updatePushableCount,
  type UndoRedoApplyHost
} from './undo-redo-apply.js';
// 重新导出供测试和外部消费者使用（移动到独立文件后保持 API 兼容）
export { filterHistoriesByScope, filterUndoableHistories, getScopeKey } from './history-filters.js';
export { generateHistoryDescription } from './history-item-builder.js';

/**
 * 取一批变更号里的最小值。
 *
 * @param changeIds - 已筛过的合法变更号，非空
 * @returns 其中的最小值
 *
 * @remarks
 * 不写 `Math.min(...changeIds)`：展开传参的实参个数受引擎栈帧限制（V8 约 6.5 万），
 * 而这里的入参是一次批量写事件的**全部**变更号 —— 一次十万行的 bulk insert 就能把它
 * 压成 `RangeError`，落在一条与批量大小相关、小数据量下永远复现不了的路径上。
 */
const minChangeId = (changeIds: readonly number[]): number =>
  changeIds.reduce((min, changeId) => (changeId < min ? changeId : min), Number.POSITIVE_INFINITY);

/**
 * 历史记录管理器：变更历史、内存 redo 栈、多作用域 undo/redo API。
 *
 * 数据流：`RxDBChange[] → #all_changes$ → histories$ → undoHistories$ / redoHistories$`
 */
export class HistoryManager {
  #subscriptions: Subscription[] = [];
  #destroyed = false;
  #scopeHost!: HistoryScopeApiHost;
  #applyHost!: UndoRedoApplyHost;

  /** 销毁信号（ReplaySubject：迟到订阅者直接 complete，避免重拉活查询） */
  #destroy$ = new ReplaySubject<void>(1);

  /** undo / redo / invalidateRedoStack 串行锁 */
  #operation_lock: Promise<unknown> = Promise.resolve();

  /** 远程待 pull 计数，pull 结束后按 {@link settlePullableCount} 结算 */
  #pullableCount$ = new BehaviorSubject<number>(0);

  /** pullable 计数代次：结算令牌，用于判断 pull 期间是否有新事件 */
  #pullableGeneration = 0;

  /** 可 push 计数（repository 级 lastPushedChangeId 过滤） */
  #pushableCount$ = new BehaviorSubject<number>(0);

  /** pushable 刷新代次：只让最新那次刷新改写计数 */
  #pushableGeneration = 0;

  /** push/pull 完成后强制刷新 undoHistories$ */
  #pushableCountTrigger$ = new BehaviorSubject<number>(0);

  #revertStateWatermarks = new Map<number, { reverted: boolean; updatedAt: number }>();
  #revertStateWatermarkTrigger$ = new BehaviorSubject<number>(0);

  /** redo 失效判定水位：id ≤ 该值视为 undo 前迟到通知，不清栈 */
  #redoInvalidationFloor = 0;

  /** 当前分支 session 内变更流 */
  #all_changes$!: Observable<RxDBChange[]>;

  /** 首次连接时间：createdAt 早于此的变更不可 undo */
  #firstConnectedAt: Date | null = null;

  /** `firstConnectedAt` 不可用时的会话起点（构造时刻，必须定格） */
  readonly #sessionStartedAt = new Date();

  /** 按分支隔离的 undo session */
  #undoSessions = new Map<string, UndoSession>();

  /** 尚未访问的分支继承的 session 模板（仅 {@link clearAllUndoHistory} 写入） */
  #undoSessionFloor: UndoSession | null = null;

  /** 全局单调 session 代次（跨分支不复用） */
  #undoSessionCounter = 0;

  /** 当前分支 id；`null` 表示活跃分支还没解析出来 */
  #currentUndoBranchId: string | null = null;

  /** 当前分支 session 视图（真源 {@link #undoSessions}） */
  #undoSession$ = new BehaviorSubject<UndoSession>({
    generation: 0,
    state: 'active',
    boundary: INITIAL_UNDO_BOUNDARY
  });

  private isUndoRedoInProgress = false;
  private isInvalidatingRedo = false;
  /** 进行中的 pull/push 深度（可重入，避免并发同步提前清标志） */
  private syncDepth = 0;
  private readonly redoStack = new RedoStack();
  private history_cache = new Map<string, HistoryScopeAPI>();
  private history_ref_counts = new Map<string, number>();
  histories$: Observable<HistoryItem[]>;
  undoHistories$: Observable<HistoryItem[]>;
  redoHistories$: Observable<HistoryItem[]>;
  undoCount$: Observable<number>;
  redoCount$: Observable<number>;

  /** 内部错误流：派生流降级的同时把错误推给订阅者 */
  readonly errors$ = new Subject<Error>();
  pushableCount$: Observable<number>;
  pullableCount$: Observable<number>;

  count$: Observable<number>;

  /**
   * 当前撤销 session generation。
   *
   * @internal 供 VersionManager 在事务开始时捕获事件所属 session
   */
  get undoSessionGeneration(): number {
    return this.#undoSession$.value.generation;
  }

  constructor(private rxdb: RxDB) {
    // Host 必须在任何订阅之前建好：pushableCount 订阅会同步触发 #updatePushableCount。
    this.#scopeHost = this.#createScopeHost();
    this.#applyHost = this.#createApplyHost();

    const branchRepository = rxdb.entityManager.getRepository(RxDBBranch);
    const changeRepository = rxdb.entityManager.getRepository(RxDBChange);
    const current_branch$ = branchRepository.findOne({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      }
    });

    this.#subscriptions.push(
      current_branch$.pipe(takeUntil(this.#destroy$)).subscribe({
        next: branch => this.#switchUndoSessionBranch(branch?.id ?? null),
        error: error => this.#reportStreamError('undo session 分支跟随的活跃分支流已中断', error)
      })
    );

    this.#all_changes$ = combineLatest({
      connected: this.rxdb.connected$,
      branch: current_branch$
    }).pipe(
      filter(({ connected, branch }) => connected && !!branch),
      switchMap(({ branch }) => {
        const firstConnectedAt = this.#getFirstConnectedAt();
        return changeRepository.findAll({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'branchId',
                operator: '=',
                value: branch!.id
              },
              {
                field: 'createdAt',
                operator: '>=',
                value: firstConnectedAt
              }
            ]
          },
          orderBy: [{ field: 'id', sort: 'desc' }]
        });
      }),
      takeUntil(this.#destroy$)
    );

    const persistedHistories$ = this.#all_changes$.pipe(
      map(changes => convertChangesToHistories(changes)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.histories$ = combineLatest([persistedHistories$, this.#revertStateWatermarkTrigger$]).pipe(
      map(([histories]) => this.#applyLocalRevertState(histories)),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.count$ = this.histories$.pipe(
      map(histories => histories.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.undoHistories$ = combineLatest({
      histories: this.histories$,
      undoSession: this.#undoSession$,
      trigger: this.#pushableCountTrigger$ // 监听 push/pull 完成事件
    }).pipe(
      switchMap(async ({ histories, undoSession }) => {
        if (undoSession.state === 'cleared') {
          return [];
        }

        try {
          const branch = await firstValueFrom(
            this.rxdb.entityManager.getRepository(RxDBBranch).findOne({
              where: {
                combinator: 'and',
                rules: [{ field: 'activated', operator: '=', value: true }]
              }
            })
          );

          if (!branch) return [];

          const localAdapter = await firstValueFrom(this.rxdb.localAdapter$);
          const RxDBSyncRepo = getLocalRxDBSyncRepository(localAdapter);
          const repoSyncs = await RxDBSyncRepo.find({
            where: {
              combinator: 'and',
              rules: [{ field: 'branchId', operator: '=', value: branch.id }]
            }
          });

          // 与 `fetchLatestHistories` 同源：反应式的可撤销列表必须和真正执行撤销时
          // 的判定逐字一致，否则 UI 上还亮着的那一项点下去要么无效、要么撤掉一条在飞的变更
          const lastPushedMap = buildLastPushedMap(repoSyncs, this.rxdb.versionManager.pushInFlight.snapshot());

          return filterUndoableHistories(
            histories,
            lastPushedMap,
            undoSession.boundary.changeId,
            undoSession.boundary.createdAfter
          );
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          this.errors$.next(normalized);
          return [];
        }
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.redoHistories$ = this.redoStack.items$;

    this.undoCount$ = this.undoHistories$.pipe(
      map(histories => histories.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.redoCount$ = this.redoHistories$.pipe(
      map(histories => histories.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.pushableCount$ = this.#pushableCount$.asObservable();
    this.pullableCount$ = this.#pullableCount$.asObservable();

    const pushableCountSub = combineLatest({
      connected: this.rxdb.connected$,
      branch: current_branch$
    })
      .pipe(
        filter(({ connected, branch }) => connected && !!branch),
        switchMap(({ branch }) => {
          const baseRules = [
            { field: 'branchId' as const, operator: '=' as const, value: branch!.id },
            { field: 'revertChangeId' as const, operator: '=' as const, value: null },
            { field: 'remoteId' as const, operator: '=' as const, value: null }
          ];
          return changeRepository
            .count({
              where: { combinator: 'and', rules: baseRules }
            })
            .pipe(
              // 降级而不终结：一次计数查询失败不该让整条 pushableCount 流停摆，
              // 所以这里仍然返回 EMPTY。但**必须报出去** —— 从前是裸的
              // `catchError(() => EMPTY)`，外层 subscribe 的 error 回调永远等不到，
              // 计数悄悄停在旧值，UI 上「有 N 条待推送」再也不动，没有任何人知道。
              catchError((error: unknown) => {
                this.#reportStreamError('pushableCount 的变更计数查询', error);
                return EMPTY;
              })
            );
        })
      )
      .subscribe({
        next: () => {
          this.#updatePushableCount();
        },
        error: error => this.#reportStreamError('pushableCount 重算的活跃分支流已中断', error)
      });
    this.#subscriptions.push(pushableCountSub);

    this.rxdb.addEventListener(REPOSITORY_SYNC_COMPLETE_EVENT, this.#onRepositorySyncComplete);
    this.#updatePushableCount();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#destroy$.next();
    this.#destroy$.complete();
    for (const sub of this.#subscriptions) {
      sub.unsubscribe();
    }
    this.#subscriptions.length = 0;
    this.rxdb.removeEventListener(REPOSITORY_SYNC_COMPLETE_EVENT, this.#onRepositorySyncComplete);
    this.#revertStateWatermarks.clear();
    this.errors$.complete();
  }

  /** 增加远程待 pull 计数 */
  incrementPullableCount(count: number): void {
    this.#pullableGeneration++;
    const newValue = this.#pullableCount$.value + count;
    this.#pullableCount$.next(newValue);
  }

  /** session 重置时清零 pullable；pull 结束结算走 {@link settlePullableCount} */
  resetPullableCount(): void {
    this.#pullableGeneration++;
    this.#pullableCount$.next(0);
  }

  /** pull 开始前签发结算令牌，必须在真正发起 pull 之前取 */
  beginPullableSettlement(): number {
    return this.#pullableGeneration;
  }

  /** 用远端水位线校准待拉计数 */
  reconcilePullableCount(token: number, count: number): void {
    const nextCount = token === this.#pullableGeneration ? count : Math.max(this.#pullableCount$.value, count);
    this.#pullableCount$.next(nextCount);
  }

  /** 按一次 pull 的实际覆盖范围结算待拉计数 */
  settlePullableCount(token: number, settlement: { complete: boolean; pulled: number }): void {
    this.#pullableCount$.next(
      settledPullableCount(this.#pullableCount$.value, {
        complete: settlement.complete,
        concurrent: token !== this.#pullableGeneration,
        pulled: settlement.pulled
      })
    );
  }

  /** 推入 redo 栈（新项在前，超容量丢尾） */
  pushToRedoStack(items: HistoryItem[]): void {
    this.redoStack.push(items);
  }

  /** 按身份从 redo 栈移除已应用项（作用域 redo 未必在栈顶） */
  removeFromRedoStack(items: HistoryItem[]): HistoryItem[] {
    return this.redoStack.remove(items);
  }

  /** 清空 redo 栈 */
  clearRedoStack(): void {
    this.redoStack.clear();
  }

  /** switchBranch 提交后同步切 undo session，避免 await 中间引用比对失配 */
  setUndoBranch(branchId: string): void {
    this.#switchUndoSessionBranch(branchId);
  }

  /** 清空当前分支 undo/redo；连接级重置用 {@link clearAllUndoHistory} */
  clearUndoHistory(): void {
    this.#setUndoSession({
      generation: this.#nextUndoSessionGeneration(),
      state: 'cleared',
      boundary: this.#undoSession$.value.boundary,
      clearedAt: new Date()
    });
    this.clearRedoStack();
  }

  /** 清空所有分支 undo/redo，并推进 {@link #undoSessionFloor} */
  clearAllUndoHistory(): void {
    const clearedAt = new Date();
    const toCleared = (session: UndoSession): UndoSession => ({
      generation: this.#nextUndoSessionGeneration(),
      state: 'cleared',
      boundary: session.boundary,
      clearedAt
    });

    for (const [branchId, session] of this.#undoSessions) {
      this.#undoSessions.set(branchId, toCleared(session));
    }
    this.#undoSessionFloor = toCleared(
      this.#undoSessionFloor ?? { generation: 0, state: 'active', boundary: INITIAL_UNDO_BOUNDARY }
    );

    const current = this.#currentUndoBranchId === null ? undefined : this.#undoSessions.get(this.#currentUndoBranchId);
    this.#undoSession$.next(current ?? this.#undoSessionFloor);
    this.clearRedoStack();
  }

  /** 用属于当前 clear session 的本地写入事件恢复 undo */
  resetSyncCleared(changeIds: readonly number[] = [], event?: UndoSessionEvent): void {
    const session = this.#undoSession$.value;
    if (session.state === 'active') return;

    const validChangeIds = changeIds.filter(id => Number.isSafeInteger(id) && id > 0);
    if (event === undefined) {
      if (validChangeIds.length === 0) return;
      const firstPostClearChangeId = minChangeId(validChangeIds);
      this.#setUndoSession({
        generation: session.generation,
        state: 'active',
        boundary: {
          changeId: Math.max(session.boundary.changeId, firstPostClearChangeId - 1),
          createdAfter: session.boundary.createdAfter
        }
      });
      return;
    }

    const belongsToCurrentSession =
      event.generation === null ?
        event.recordAt !== null &&
        Number.isFinite(event.recordAt.getTime()) &&
        event.recordAt.getTime() > session.clearedAt.getTime()
      : event.generation === session.generation;
    if (!belongsToCurrentSession) return;

    const firstPostClearChangeId = validChangeIds.length > 0 ? minChangeId(validChangeIds) : null;
    const createdAfter =
      (
        firstPostClearChangeId === null &&
        (session.boundary.createdAfter === null ||
          session.boundary.createdAfter.getTime() < session.clearedAt.getTime())
      ) ?
        session.clearedAt
      : session.boundary.createdAfter;

    this.#setUndoSession({
      generation: session.generation,
      state: 'active',
      boundary: {
        changeId:
          firstPostClearChangeId === null ?
            session.boundary.changeId
          : Math.max(session.boundary.changeId, firstPostClearChangeId - 1),
        createdAfter
      }
    });
  }

  /** 正在执行 undo/redo 或同步 */
  isExecutingUndoRedo(): boolean {
    return this.isUndoRedoInProgress || this.isInvalidatingRedo || this.syncDepth > 0;
  }

  /** 在可重入同步上下文中执行：期间变更不影响 undo/redo 栈 */
  async syncing<T>(fn: () => Promise<T>): Promise<T> {
    this.syncDepth += 1;
    try {
      return await fn();
    } finally {
      this.syncDepth -= 1;
    }
  }

  /**
   * 使 redo 栈失效。全部 trigger id ≤ {@link #redoInvalidationFloor} 视为迟到通知，跳过。
   *
   * @remarks
   * 这里**不查** `isUndoRedoInProgress` / `isInvalidatingRedo`：undo、redo 与本方法三个入口
   * 全部排进 {@link HistoryManager.#runSerialized}，两个标志又只在同一个序列化任务内部置起
   * 再复位，因此轮到本任务时它们必然已复位——查了也是一条走不到的分支。下面那句
   * `isInvalidatingRedo = true` 留着是给 {@link HistoryManager.isExecutingUndoRedo} 读的，
   * 真正生效的守卫在调用方 `VersionManager` 的 `if (!historyManager.isExecutingUndoRedo())`，
   * 它连 `syncDepth` 一起看，覆盖比这里严。
   *
   * @internal
   */
  async invalidateRedoStack(triggerChangeIds?: readonly number[]): Promise<void> {
    return this.#runSerialized(async () => {
      if (triggerChangeIds?.length && triggerChangeIds.every(id => id <= this.#redoInvalidationFloor)) {
        return;
      }

      this.isInvalidatingRedo = true;
      try {
        const redoHistories = await firstValueFrom(this.redoHistories$);
        if (redoHistories.length === 0) return;

        const redoableChanges = redoHistories.flatMap(h => h.changes);
        const now = new Date();
        const actions = get_switch_version_actions([], false);
        const { adapter } = await this.rxdb.versionManager.getLocalRepositories();

        redoableChanges.forEach(change => {
          const changeKey = `rxdb:RxDBChange:${change.id}`;
          actions.updates.set(changeKey, {
            patch: {
              redoInvalidatedAt: now
            },
            inversePatch: {
              redoInvalidatedAt: null
            }
          });
        });

        // 作废 redo 栈同样只重写投影（行 4）。这里与下面 undo-redo-apply 调的是同一个原语，
        // 两者的结论相反，区别只在这条声明里。
        declareTrustedWrite(adapter, {
          file: 'HistoryManager.ts',
          symbol: 'invalidateRedoStack',
          intent: TrustedWriteIntent.redo_invalidation
        });
        // 不传 branchId：这里只想把 actions 套用在**当前**分支上。自己先查再传会留下一个
        // 采样窗口——本方法是 detached 任务（变更通知还会被批处理 / 跨进程延迟），窗口内的一次
        // 真实 switchBranch 会让这条调用把 activated 与全部触发器倒回旧分支。
        // 同上：分支不换，没有前置条件可校验。
        await adapter.switchBranch({ actions, prepare: SKIP_BRANCH_SWITCH_PREPARE });

        this.clearRedoStack();
      } catch (error) {
        console.error('[HistoryManager] Failed to invalidate redo stack:', error);
        throw error;
      } finally {
        this.isInvalidatingRedo = false;
      }
    });
  }

  /** 创建（或取出缓存的）作用域历史 API */
  history<T extends EntityType>(options?: T | InstanceType<T> | HistoryScope): HistoryScopeAPI {
    return createHistoryScopeApi(this.#scopeHost, options);
  }

  /** 选出完整事务；跨作用域则抛 {@link RxDBCrossScopeTransactionError} */
  #selectWholeTransactions(histories: HistoryItem[], scope: HistoryScope, step: number): HistoryItem[] {
    const { crossScope, selected } = selectScopedHistories(histories, scope, step);
    if (crossScope.length > 0) {
      throw new RxDBCrossScopeTransactionError(scope, crossScope);
    }
    return selected;
  }

  /** 分配一个全局唯一的 undo session 代次 */
  #nextUndoSessionGeneration(): number {
    return ++this.#undoSessionCounter;
  }

  /** 写当前分支的 session：真源落在 {@link #undoSessions}，视图同步跟上 */
  #setUndoSession(session: UndoSession): void {
    if (this.#currentUndoBranchId !== null) {
      this.#undoSessions.set(this.#currentUndoBranchId, session);
    }
    this.#undoSession$.next(session);
  }

  /**
   * 落日志并推 `errors$`，不升级成 RxJS 未捕获异常。
   *
   * @remarks
   * 销毁后与适配器停机错误一律静默：那两种情况下的报错是拆卸噪声，不是故障。
   *
   * 措辞由调用方给全（`source` 直接拼进日志），因为两类调用方的后果不同：
   * 订阅上的 `error` 回调意味着那条流**已经终结**，而 `catchError` 里的降级
   * 只是丢掉一次结果、流还活着。用一句写死的「已中断」会把后者说成前者。
   */
  #reportStreamError(source: string, error: unknown): void {
    if (this.#destroyed || isAdapterShutdownError(error)) return;
    console.error(`[HistoryManager] ${source}:`, error);
    this.errors$.next(error instanceof Error ? error : new Error(String(error)));
  }

  /** 切到新活跃分支的 session；未解析时的 clear 归属第一个分支 */
  #switchUndoSessionBranch(branchId: string | null): void {
    if (branchId === this.#currentUndoBranchId) return;

    if (this.#currentUndoBranchId === null && branchId !== null && !this.#undoSessions.has(branchId)) {
      this.#undoSessions.set(branchId, this.#undoSession$.value);
    }
    this.#currentUndoBranchId = branchId;
    if (branchId === null) return;

    const existing = this.#undoSessions.get(branchId);
    const session = existing ?? this.#inheritUndoSession();
    this.#undoSessions.set(branchId, session);
    this.#undoSession$.next(session);
  }

  /** 首次访问某个分支时按 {@link #undoSessionFloor} 建它自己的 session */
  #inheritUndoSession(): UndoSession {
    const generation = this.#nextUndoSessionGeneration();
    const floor = this.#undoSessionFloor;
    return floor === null ? { generation, state: 'active', boundary: INITIAL_UNDO_BOUNDARY } : { ...floor, generation };
  }

  #applyLocalRevertState(histories: HistoryItem[]): HistoryItem[] {
    return histories.map(history => {
      let reverted = false;

      for (const change of history.changes) {
        const persistedState = {
          reverted: change.revertChangeId != null,
          updatedAt: change.updatedAt.getTime()
        };
        const watermark = this.#revertStateWatermarks.get(change.id);
        const currentState = watermark && watermark.updatedAt >= persistedState.updatedAt ? watermark : persistedState;

        if (watermark && persistedState.updatedAt > watermark.updatedAt) {
          this.#revertStateWatermarks.set(change.id, persistedState);
        }
        reverted ||= currentState.reverted;
      }

      return reverted === history.reverted ? history : { ...history, reverted };
    });
  }

  #getNextRevertStateUpdatedAt(changes: RxDBChange[]): Date {
    let updatedAt = Date.now();

    for (const change of changes) {
      const watermark = this.#revertStateWatermarks.get(change.id)?.updatedAt ?? 0;
      updatedAt = Math.max(updatedAt, change.updatedAt.getTime() + 1, watermark + 1);
    }

    return new Date(updatedAt);
  }

  #setRevertStateWatermarks(changes: RxDBChange[], reverted: boolean, updatedAt: Date): void {
    for (const change of changes) {
      this.#revertStateWatermarks.set(change.id, { reverted, updatedAt: updatedAt.getTime() });
    }
    this.#revertStateWatermarkTrigger$.next(this.#revertStateWatermarkTrigger$.value + 1);
  }

  /** 串行执行 invalidateRedoStack / undo / redo */
  #runSerialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#operation_lock.then(task, task);
    this.#operation_lock = result.catch(() => undefined);
    return result;
  }

  #getFirstConnectedAt(): Date {
    if (!this.#firstConnectedAt) {
      this.#firstConnectedAt = this.rxdb.firstConnectedAt ?? this.#sessionStartedAt;
    }
    return this.#firstConnectedAt;
  }

  #isUndoSessionCurrent(session: ActiveUndoSession): boolean {
    return this.#undoSession$.value === session;
  }

  async #fetch_latest_histories(
    undoBoundary: UndoBoundary
  ): Promise<{ histories: HistoryItem[]; lastPushedMap: Map<string, number> }> {
    return fetchLatestHistories(this.#applyHost, undoBoundary);
  }

  readonly #onRepositorySyncComplete = () => {
    this.#updatePushableCount();
    this.#pushableCountTrigger$.next(Date.now());
  };

  async #apply_undo_redo_histories(
    operation: 'undo' | 'redo',
    histories: HistoryItem[],
    undoSession?: ActiveUndoSession
  ): Promise<void> {
    return applyUndoRedoHistories(this.#applyHost, operation, histories, undoSession);
  }

  async #updatePushableCount(): Promise<void> {
    return updatePushableCount(this.#applyHost);
  }

  #createScopeHost(): HistoryScopeApiHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 宿主 getter 需捕获 HistoryManager 私有字段
    const manager = this;
    return {
      get history_cache() {
        return manager.history_cache;
      },
      get history_ref_counts() {
        return manager.history_ref_counts;
      },
      get histories$() {
        return manager.histories$;
      },
      get undoHistories$() {
        return manager.undoHistories$;
      },
      get redoHistories$() {
        return manager.redoHistories$;
      },
      get undoSession$() {
        return manager.#undoSession$;
      },
      runSerialized: task => manager.#runSerialized(task),
      fetchLatestHistories: boundary => manager.#fetch_latest_histories(boundary),
      isUndoSessionCurrent: session => manager.#isUndoSessionCurrent(session),
      selectWholeTransactions: (h, s, n) => manager.#selectWholeTransactions(h, s, n),
      applyUndoRedoHistories: (op, h, s) => manager.#apply_undo_redo_histories(op, h, s)
    };
  }

  #createApplyHost(): UndoRedoApplyHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 宿主 getter 需捕获 HistoryManager 私有字段
    const manager = this;
    return {
      get rxdb() {
        return manager.rxdb;
      },
      get destroyed() {
        return manager.#destroyed;
      },
      get isUndoRedoInProgress() {
        return manager.isUndoRedoInProgress;
      },
      set isUndoRedoInProgress(v) {
        manager.isUndoRedoInProgress = v;
      },
      get redoInvalidationFloor() {
        return manager.#redoInvalidationFloor;
      },
      set redoInvalidationFloor(v) {
        manager.#redoInvalidationFloor = v;
      },
      get pushableGeneration() {
        return manager.#pushableGeneration;
      },
      set pushableGeneration(v) {
        manager.#pushableGeneration = v;
      },
      get pushableCount$() {
        return manager.#pushableCount$;
      },
      get pushableCountTrigger$() {
        return manager.#pushableCountTrigger$;
      },
      get errors$() {
        return manager.errors$;
      },
      getFirstConnectedAt: () => manager.#getFirstConnectedAt(),
      isUndoSessionCurrent: s => manager.#isUndoSessionCurrent(s),
      getNextRevertStateUpdatedAt: c => manager.#getNextRevertStateUpdatedAt(c),
      setRevertStateWatermarks: (c, r, d) => manager.#setRevertStateWatermarks(c, r, d),
      pushToRedoStack: i => manager.pushToRedoStack(i),
      removeFromRedoStack: i => manager.removeFromRedoStack(i)
    };
  }
}

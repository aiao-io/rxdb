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
import { EntityType, RxDBEntityId } from '../entity/entity.interface.js';
import type { FindOptions } from '../repository/query-options.interface.js';
import type { RuleGroup } from '../repository/query.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import type { RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import { REPOSITORY_SYNC_COMPLETE_EVENT } from '../rxdb-events.js';
import { getEntityMetadata, isAdapterShutdownError } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { RxDBBranch } from '../system/branch.js';
import { getRxDBEntityIdentityKey } from '../system/change-codec.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import type { RxDBChangeRuleGroup, RxDBSyncOrderByField, RxDBSyncRuleGroup } from '../system/types.js';
import { convertChangesToHistories, generateHistoryDescription } from './history-item-builder.js';
import { settledPullableCount } from './pullable-count.js';
import { RedoStack } from './redo-stack.js';
import { RxDBCrossScopeTransactionError, selectScopedHistories } from './scope-selection.js';
import { get_switch_version_actions } from './switch-branch-actions.js';
import { getSyncCapability, getSyncType, isRepositorySyncEnabled } from './sync-type-utils.js';
import { HistoryItem, HistoryScope, HistoryScopeAPI } from './VersionManager.interface.js';

// 重新导出供测试和外部消费者使用（移动到 history-item-builder.ts 后保持公共 API 兼容）
export { generateHistoryDescription } from './history-item-builder.js';

/**
 * 按作用域过滤历史记录（纯函数）
 *
 * @param histories - 原始历史记录数组
 * @param scope - 作用域配置
 * @returns 过滤后的历史记录数组
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function filterHistoriesByScope(histories: HistoryItem[], scope: HistoryScope): HistoryItem[] {
  if (scope.type === 'database') {
    return histories;
  }

  return histories
    .map(history => {
      const filtered_changes = history.changes.filter(change => {
        if (scope.type === 'repository') {
          return change.namespace === scope.namespace && change.entity === scope.entity;
        }
        // 实体作用域
        return (
          change.namespace === scope.namespace && change.entity === scope.entity && change.entityId === scope.entityId
        );
      });

      if (filtered_changes.length === 0) return null;

      return {
        ...history,
        changes: filtered_changes,
        count: filtered_changes.length,
        description: generateHistoryDescription(filtered_changes)
      };
    })
    .filter((h): h is HistoryItem => h !== null);
}

const getRepositoryKey = (repository: { namespace: string; entity: string }): string =>
  `${repository.namespace}:${repository.entity}`;

type LocalRxDBSyncRepository = IRepository<typeof RxDBSync> & {
  find(options: FindOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>): Promise<RxDBSync[]>;
};

const getLocalRxDBSyncRepository = (adapter: RxDBAdapterLocalBase): LocalRxDBSyncRepository =>
  adapter.getRepository<typeof RxDBSync, LocalRxDBSyncRepository>(RxDBSync);

type UndoBoundary = Readonly<{
  changeId: number;
  createdAfter: Date | null;
}>;

type ActiveUndoSession = Readonly<{
  generation: number;
  state: 'active';
  boundary: UndoBoundary;
}>;

type ClearedUndoSession = Readonly<{
  generation: number;
  state: 'cleared';
  boundary: UndoBoundary;
  clearedAt: Date;
}>;

type UndoSession = ActiveUndoSession | ClearedUndoSession;

type UndoSessionEvent = Readonly<{
  generation: number | null;
  recordAt: Date | null;
}>;

const INITIAL_UNDO_BOUNDARY: UndoBoundary = { changeId: 0, createdAfter: null };

/**
 * 过滤出可撤销的历史记录（纯函数）
 *
 * @param histories - 原始历史记录数组
 * @param lastPushedMap - namespace:entity -> lastPushedChangeId 的 repository 级水位线映射
 * @param undoBoundaryChangeId - 同步清空后的永久撤销边界
 * @param undoBoundaryCreatedAfter - 无数字 change id 时使用的严格时间边界
 * @returns 可撤销的历史记录数组
 *
 * @remarks
 * undoHistories$（UI 展示）与 undo()（实际执行）共用同一套规则，
 * 保证 UI 上看不到的历史不会被 undo() 撤销：
 * 1. history.reverted == false（按 updatedAt 水位合并持久态与本地态，未被撤销）
 * 2. remoteId == null（只有本地创建的变更才能撤销）
 * 3. id > 该 repository 的 lastPushedChangeId（未推送到远程；按 repository 独立判断）
 * 4. id > undoBoundaryChangeId（同步清空前的历史永久不可撤销）
 * 5. createdAt > undoBoundaryCreatedAfter（无数字 id 时保守隔离旧 session）
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function filterUndoableHistories(
  histories: HistoryItem[],
  lastPushedMap: Map<string, number>,
  undoBoundaryChangeId = 0,
  undoBoundaryCreatedAfter: Date | null = null
): HistoryItem[] {
  return histories.filter(history => {
    if (history.reverted) return false;

    return history.changes.every(change => {
      const isLocal = change.remoteId == null;
      const lastPushedId = lastPushedMap.get(getRepositoryKey(change));
      const notPushed = lastPushedId == null || change.id > lastPushedId;
      const afterUndoBoundary = change.id > undoBoundaryChangeId;
      const afterUndoTimeBoundary =
        undoBoundaryCreatedAfter === null || change.createdAt.getTime() > undoBoundaryCreatedAfter.getTime();
      return isLocal && notPushed && afterUndoBoundary && afterUndoTimeBoundary;
    });
  });
}

/**
 * 生成历史项描述（纯函数）
 *
 * @param changes - 变更记录数组
 * @returns 描述文本
 *
 * @remarks
 * 单条变更：「创建 User」「更新 Todo」
 * 多条变更：「事务: 创建2条, 更新3条」
 *
 * @internal 供 HistoryManager 和单元测试使用
 */

/**
 * 生成作用域缓存键（纯函数）
 *
 * @param scope - 作用域配置
 * @returns 缓存键字符串：'database' | 'namespace:entity' | 'namespace:entity:id'
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function getScopeKey(scope: HistoryScope): string {
  if (scope.type === 'database') {
    return 'database';
  }
  if (scope.type === 'repository') {
    return `${scope.namespace}:${scope.entity}`;
  }
  return `${scope.namespace}:${scope.entity}:${getRxDBEntityIdentityKey(scope.entityId)}`;
}

/**
 * 历史记录管理器
 *
 * 管理数据库变更历史和内存 redo 栈，为 VersionManager 提供撤销/重做能力。
 *
 * @remarks
 * **核心职责**
 * - 实时查询变更记录（RxDBChange），自动按事务分组转换为结构化历史项
 * - 维护内存 redo 栈（会话级，重启后清空）
 * - 提供多作用域历史记录 API（database/repository/entity）
 * - 管理 undo/redo 操作和 redo 栈失效逻辑
 *
 * **数据流**
 * ```
 * RxDBChange[] → #all_changes$ → histories$ → undoHistories$
 *                                          → redo_stack_subject → redoHistories$
 * ```
 */
export class HistoryManager {
  #subscriptions: Subscription[] = [];
  #destroyed = false;

  /**
   * 销毁信号，用于终结所有派生流。
   *
   * 用 `ReplaySubject(1)` 而非 `Subject`：`takeUntil` 先订阅通知源、再决定要不要订阅上游，
   * 重放的销毁信号会让 destroy() 之后的迟到订阅者直接拿到 complete，
   * 上游那条 RxDBChange 活查询不会被重新拉起来。
   */
  #destroy$ = new ReplaySubject<void>(1);

  /**
   * undo / redo / invalidateRedoStack 三种操作的串行化锁
   *
   * 这三个操作都会修改 RxDBChange 表的状态字段（revertChangeId / redoInvalidatedAt），
   * 并发执行会产生 race（如 getRxDBChangeSequence 分配同一序列号）。
   * 通过 Promise chain 让所有这类操作排队顺序执行。
   */
  #operation_lock: Promise<unknown> = Promise.resolve();

  /**
   * 远程待 pull 的变更数量
   * 通过监听远程事件累计，pull 结束后按 {@link settlePullableCount} 结算
   */
  #pullableCount$ = new BehaviorSubject<number>(0);

  /**
   * pullable 计数的单调代次：每次远端事件累加或显式重置都 +1
   *
   * {@link beginPullableSettlement} 取走当前值当令牌，{@link settlePullableCount} 用它判断
   * 「这次 pull 期间有没有新事件到达」。有的话就不能归零，只能扣掉实际拉到的数量。
   */
  #pullableGeneration = 0;

  /**
   * 可 push 的变更数量（使用 repository-level lastPushedChangeId 过滤）
   * 通过异步计算后更新
   */
  #pushableCount$ = new BehaviorSubject<number>(0);

  /**
   * pushable 计数刷新的单调代次
   *
   * `#updatePushableCount()` 是异步的，且由「变更流」和「同步完成事件」两个源头触发，
   * 完全可能有多次刷新同时在飞。没有代次保护时，先发起、后落地的那次会把新值盖回旧值 ——
   * 包括它的失败降级路径 `next(0)`。
   */
  #pushableGeneration = 0;

  /**
   * 触发器：用于在 push/pull 完成后强制刷新 undoHistories$
   */
  #pushableCountTrigger$ = new BehaviorSubject<number>(0);

  #revertStateWatermarks = new Map<number, { reverted: boolean; updatedAt: number }>();
  #revertStateWatermarkTrigger$ = new BehaviorSubject<number>(0);

  /**
   * redo 栈失效判定的 change 序列水位
   *
   * undo 预分配 revertChangeId 时把序列推进到 `seq + changes.length`，此后**真正的新写入**
   * 拿到的 id 必然大于它。而 undo 之前那些写入的 change-INSERT 通知可能经宿主 debounce
   * 与跨进程传输（Tauri 的 stdio 宿主最典型）在 undo 完成后才到达——
   * `isExecutingUndoRedo()` 这类时间窗守卫挡不住迟到者。id 与水位比较是内容判定：
   * 全部 ≤ 水位 ⇒ 迟到的旧通知，不该清栈。
   */
  #redoInvalidationFloor = 0;

  /**
   * 所有变更记录流（从数据库实时查询）
   */
  #all_changes$!: Observable<RxDBChange[]>;

  /**
   * 首次连接时间
   *
   * 用于过滤 session 内的变更：只有 createdAt >= firstConnectedAt 的变更才能被 undo
   * 这是初始过滤条件，pull/push 后会通过 syncCleared 来清空 undo 历史
   */
  #firstConnectedAt: Date | null = null;

  /**
   * `rxdb.firstConnectedAt` 不可用时的会话起点：本实例的构造时刻。
   *
   * gateway 的 leader 选举在没有 `navigator.locks` 的环境（Node / Tauri 测试宿主）走
   * BroadcastChannel 降级路径，选举完成前 `rxdb.firstConnectedAt` 一直是 undefined；
   * `multiInstance: false` 时则永远是。回退值必须在构造时就定格——若等到首次取用
   * （可能就是 undo 本身）才取 `new Date()`，本会话所有已落库的变更都早于该水位，
   * undo 会静默变成 no-op。构造发生在连接完成之前，恒早于本会话的任何变更，是安全下界。
   */
  readonly #sessionStartedAt = new Date();

  /**
   * 每个分支一份 undo session
   *
   * 同步只改写当前分支的数据，清空 undo 边界自然也只该落在当前分支上。旧实现是单一全局
   * session：任一仓库同步完成就把**所有**分支的 undo 历史一起清掉；更糟的是
   * `boundary.changeId` 是全局单调的 change id，其他分支上早于该水位的变更会被永久
   * 判成不可撤销——它们从头到尾没参与过这次同步。
   */
  #undoSessions = new Map<string, UndoSession>();

  /**
   * 还没有自己 session 的分支所继承的模板
   *
   * 只有 {@link clearAllUndoHistory}（连接级 session 重置）会写它：那时整个历史上下文都
   * 作废了，包括本次会话还没访问过的分支。
   */
  #undoSessionFloor: UndoSession | null = null;

  /**
   * 全局单调的 session 代次
   *
   * 跨分支也不复用：`VersionManager` 在事务开始时捕获代次、在本地写入事件里比对，
   * 若两个分支各自从 0 起算，切分支后的迟到事件会假匹配到另一个分支的 session。
   */
  #undoSessionCounter = 0;

  /** 当前分支 id；`null` 表示活跃分支还没解析出来 */
  #currentUndoBranchId: string | null = null;

  /**
   * 当前分支 session 的视图
   *
   * 真源是 {@link #undoSessions}，这里只是为了让派生流和同步读取（`undoSessionGeneration`）
   * 不必先 await 出当前分支。
   */
  #undoSession$ = new BehaviorSubject<UndoSession>({
    generation: 0,
    state: 'active',
    boundary: INITIAL_UNDO_BOUNDARY
  });

  /**
   * 标记是否正在执行 undo/redo 操作
   */
  private isUndoRedoInProgress = false;

  /**
   * 标记是否正在执行 redo 栈失效操作
   */
  private isInvalidatingRedo = false;

  /**
   * 正在进行中的 pull/push 同步深度
   * 同步期间的变更不应影响 undo/redo 栈。用深度计数而非 boolean，
   * 因为并发同步（如 bulkSync 并发跑多个仓库、或独立的 push+pull 重叠）
   * 会让先结束的一个把标志提前清掉，掩盖后一个仍在写入的变更
   */
  private syncDepth = 0;

  /**
   * 内存 redo 栈（会话级，手动管理）
   * 不持久化，应用重启后清空
   */
  /**
   * 会话级 redo 栈（不持久化，自带容量上限）
   *
   * 抽到 RedoStack 子模块：详见 `redo-stack.ts`。
   * pushToRedoStack / popFromRedoStack / clearRedoStack 公共 API 全部委托。
   */
  private readonly redoStack = new RedoStack();

  /**
   * 历史记录 API 缓存
   * 按作用域键缓存已创建的 API 实例，避免重复创建 Observable 链
   * 键格式：'database' | 'namespace:entity' | 'namespace:entity:id'
   */
  private history_cache = new Map<string, HistoryScopeAPI>();

  /**
   * 引用计数器
   * 跟踪每个作用域的活跃订阅数，当计数降为 0 时自动清理缓存
   */
  private history_ref_counts = new Map<string, number>();

  /**
   * 所有历史记录流（结构化）
   * 将 RxDBChange 按事务分组，转换为 HistoryItem
   */
  histories$: Observable<HistoryItem[]>;
  undoHistories$: Observable<HistoryItem[]>;
  redoHistories$: Observable<HistoryItem[]>;
  undoCount$: Observable<number>;
  redoCount$: Observable<number>;

  /**
   * 历史子系统内部错误流
   *
   * undoHistories$ / pushableCount$ 等流内部异步操作失败时（如 branch / repoSync 查询挂掉），
   * 流本身会降级返回 [] / 0 以避免 UI 卡死，错误同时推送到这里。
   *
   * 上层（UI / 业务）可订阅以决定 toast / retry / 上报。
   */
  readonly errors$ = new Subject<Error>();

  /**
   * 可 push 的变更数量流
   * 条件：id > lastPushedChangeId, revertChangeId == null, remoteId == null
   */
  pushableCount$: Observable<number>;

  /**
   * 远程待 pull 的变更数量流
   * 通过监听远程事件（INSERT/UPDATE/DELETE）累计
   * pull 后重置为 0
   */
  pullableCount$: Observable<number>;

  /**
   * 历史记录数量流
   */
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
    const branchRepository = rxdb.entityManager.getRepository(RxDBBranch);
    const changeRepository = rxdb.entityManager.getRepository(RxDBChange);
    const current_branch$ = branchRepository.findOne({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      }
    });

    // undo session 按分支隔离：跟住活跃分支，把视图切到它自己的那一份
    this.#subscriptions.push(
      current_branch$.pipe(takeUntil(this.#destroy$)).subscribe({
        next: branch => this.#switchUndoSessionBranch(branch?.id ?? null),
        error: error => this.#reportBranchStreamError('undo session 分支跟随', error)
      })
    );

    // 初始化变更流：基于 firstConnectedAt 过滤 session 内的变更
    // 只有 createdAt >= firstConnectedAt 的变更才能被 undo
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
      // 所有派生流都长在这条根上，在根上截断即可让 destroy() 一次性收掉整棵树
      takeUntil(this.#destroy$)
    );

    /*
     * 历史记录流：按 transactionId 分组、转换为结构化数据
     * 每次变更流更新时完整重新计算（支持 undo/redo 更新 revertChangeId）
     */
    const persistedHistories$ = this.#all_changes$.pipe(
      map(changes => convertChangesToHistories(changes)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.histories$ = combineLatest([persistedHistories$, this.#revertStateWatermarkTrigger$]).pipe(
      map(([histories]) => this.#applyLocalRevertState(histories)),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    /*
     * 历史记录数量流
     */
    this.count$ = this.histories$.pipe(
      map(histories => histories.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // 可以撤销的历史记录流
    // 判断依据：
    // 1. syncCleared == false（sync 后未清空）
    // 2. history.reverted == false（按 updatedAt 水位合并持久态与本地态）
    // 3. remoteId == null（只有本地创建的变更才能撤销）
    // 4. id > lastPushedChangeId（未推送到远程的变更）
    this.undoHistories$ = combineLatest({
      histories: this.histories$,
      undoSession: this.#undoSession$,
      trigger: this.#pushableCountTrigger$ // 监听 push/pull 完成事件
    }).pipe(
      switchMap(async ({ histories, undoSession }) => {
        // sync 后清空 undo 历史
        if (undoSession.state === 'cleared') {
          return [];
        }

        try {
          // 获取当前分支
          const branch = await firstValueFrom(
            this.rxdb.entityManager.getRepository(RxDBBranch).findOne({
              where: {
                combinator: 'and',
                rules: [{ field: 'activated', operator: '=', value: true }]
              }
            })
          );

          if (!branch) return [];

          // 获取所有 repo syncs 的 lastPushedChangeId
          const localAdapter = await firstValueFrom(this.rxdb.localAdapter$);
          const RxDBSyncRepo = getLocalRxDBSyncRepository(localAdapter);
          const repoSyncs = await RxDBSyncRepo.find({
            where: {
              combinator: 'and',
              rules: [{ field: 'branchId', operator: '=', value: branch.id }]
            }
          });

          const lastPushedMap = new Map<string, number>();
          for (const rs of repoSyncs) {
            if (rs.lastPushedChangeId !== null) {
              lastPushedMap.set(getRepositoryKey(rs), rs.lastPushedChangeId);
            }
          }

          return filterUndoableHistories(
            histories,
            lastPushedMap,
            undoSession.boundary.changeId,
            undoSession.boundary.createdAfter
          );
        } catch (error) {
          // 降级返回 [] 不让 UI 卡死，同时把错误推到 errors$ 让上层可见
          const normalized = error instanceof Error ? error : new Error(String(error));
          this.errors$.next(normalized);
          return [];
        }
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // 可以重做的历史记录流（从内存栈派生，主动管理）
    this.redoHistories$ = this.redoStack.items$;

    this.undoCount$ = this.undoHistories$.pipe(
      map(histories => histories.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.redoCount$ = this.redoHistories$.pipe(
      map(histories => histories.length),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // 可 push 的变更数量流（异步计算）
    this.pushableCount$ = this.#pushableCount$.asObservable();

    // 可 pull 的远程变更数量流
    this.pullableCount$ = this.#pullableCount$.asObservable();

    // 监听 RxDBChange 变化，触发 pushableCount 重新计算
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
            .pipe(catchError(() => EMPTY));
        })
      )
      .subscribe({
        next: () => {
          // 任何变更都触发重新计算
          this.#updatePushableCount();
        },
        error: error => this.#reportBranchStreamError('pushableCount 重算', error)
      });
    this.#subscriptions.push(pushableCountSub);

    // 监听 push/pull 完成事件，触发 pushableCount 重新计算
    this.rxdb.addEventListener(REPOSITORY_SYNC_COMPLETE_EVENT, this.#onRepositorySyncComplete);

    // 初始计算
    this.#updatePushableCount();
  }

  destroy(): void {
    this.#destroyed = true;
    // 先发销毁信号：派生流全部长在 #all_changes$ 上，截断根就能收掉整棵树，
    // 包括那条一直挂在 localAdapter 上的 RxDBChange 活查询
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

  /**
   * 增加远程待 pull 的变更计数
   * 由 VersionManager 在收到远程事件时调用
   * @param count 新增的变更数量
   */
  incrementPullableCount(count: number): void {
    this.#pullableGeneration++;
    const newValue = this.#pullableCount$.value + count;
    this.#pullableCount$.next(newValue);
  }

  /**
   * 无条件清零远程待 pull 的变更计数
   *
   * @remarks
   * 只用于 session 重置（{@link VersionManager.resetSessionState}）—— 那时整个计数上下文
   * 都作废了。pull 结束后的结算走 {@link settlePullableCount}：那条路径要区分
   * 「完整同步」和「只拉了一部分」，不能一律归零。
   */
  resetPullableCount(): void {
    this.#pullableGeneration++;
    this.#pullableCount$.next(0);
  }

  /**
   * 在一次 pull 开始前签发结算令牌
   *
   * @returns 令牌，原样交给 {@link settlePullableCount}
   *
   * @remarks
   * 必须在真正发起 pull **之前**取：令牌记录的是「拉取开始那一刻的计数代次」，
   * 拉取期间到达的远端事件会让代次前进，结算时据此判断计数里混进了本次没覆盖的新变更。
   *
   * @internal
   */
  beginPullableSettlement(): number {
    return this.#pullableGeneration;
  }

  /**
   * 用远端持久水位线计算出的精确值校准待拉计数
   *
   * @internal
   */
  reconcilePullableCount(token: number, count: number): void {
    const nextCount = token === this.#pullableGeneration ? count : Math.max(this.#pullableCount$.value, count);
    this.#pullableCount$.next(nextCount);
  }

  /**
   * 按一次 pull 的实际覆盖范围结算远程待 pull 计数
   *
   * @param token - {@link beginPullableSettlement} 签发的令牌
   * @param settlement - 本次 pull 是否完整、以及实际取回的变更数
   *
   * @internal
   */
  settlePullableCount(token: number, settlement: { complete: boolean; pulled: number }): void {
    this.#pullableCount$.next(
      settledPullableCount(this.#pullableCount$.value, {
        complete: settlement.complete,
        concurrent: token !== this.#pullableGeneration,
        pulled: settlement.pulled
      })
    );
  }

  /**
   * 添加历史项到 redo 栈
   *
   * 栈以新项在前；超出容量上限时丢弃最旧（尾部）项。详见 redo-stack.ts。
   *
   * @internal
   */
  pushToRedoStack(items: HistoryItem[]): void {
    this.redoStack.push(items);
  }

  /**
   * 按稳定身份从 redo 栈移除已应用的项
   *
   * @remarks
   * 不提供「移除 N 项」的重载：作用域 redo 应用的项未必在栈顶，按数量截取会删错项。
   * @internal
   */
  removeFromRedoStack(items: HistoryItem[]): HistoryItem[] {
    return this.redoStack.remove(items);
  }

  /**
   * 清空 redo 栈（由 VersionManager.invalidateRedoStack 调用）
   */
  clearRedoStack(): void {
    this.redoStack.clear();
  }

  /**
   * 把 undo session 视图切到指定分支（由 VersionManager.switchBranch 提交后调用）
   *
   * @remarks
   * 活跃分支的订阅源 `current_branch$` 是响应式查询，`switchBranch()` resolve 之后才会
   * 补发新分支——那一发若正好落在某次 `undo()` 的 await 中间，`#isUndoSessionCurrent`
   * 的引用比对会失配，undo 静默变成 no-op。进程内切分支走这里同步收口，订阅只留给
   * 跨标签页等外部改动兜底（同 id 会在 {@link #switchUndoSessionBranch} 里直接返回）。
   */
  setUndoBranch(branchId: string): void {
    this.#switchUndoSessionBranch(branchId);
  }

  /**
   * 清空**当前分支**的 undo/redo 历史（当 pull/push 有数据变更时调用）
   *
   * 立即进入新的 cleared session，使正在查询旧历史的 undo 失效。
   *
   * @remarks
   * 同步只改写当前分支的变更，边界也只推进当前分支。整个连接的历史上下文作废时
   * （重连 / session 重置）用 {@link clearAllUndoHistory}。
   */
  clearUndoHistory(): void {
    this.#setUndoSession({
      generation: this.#nextUndoSessionGeneration(),
      state: 'cleared',
      boundary: this.#undoSession$.value.boundary,
      clearedAt: new Date()
    });
    this.clearRedoStack();
  }

  /**
   * 清空**所有分支**的 undo/redo 历史（连接级 session 重置专用）
   *
   * @remarks
   * 连同 {@link #undoSessionFloor} 一起推进：会话重置之后才第一次被访问的分支
   * 也要从 cleared 起步，否则切过去就能撤销重置之前的内容。
   */
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

  /**
   * 用已证明属于当前 clear session 的本地 RxDBChange 事件恢复 undo。
   *
   * @param changeIds 本地创建事件携带的单调 RxDBChange id
   * @param event 事件所属事务 generation 与记录时间
   * @internal
   */
  resetSyncCleared(changeIds: readonly number[] = [], event?: UndoSessionEvent): void {
    const session = this.#undoSession$.value;
    if (session.state === 'active') return;

    const validChangeIds = changeIds.filter(id => Number.isSafeInteger(id) && id > 0);
    if (event === undefined) {
      if (validChangeIds.length === 0) return;
      const firstPostClearChangeId = Math.min(...validChangeIds);
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

    const firstPostClearChangeId = validChangeIds.length > 0 ? Math.min(...validChangeIds) : null;
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

  /**
   * 检查是否正在执行 undo/redo 或同步操作
   * @internal 供 VersionManager 的事件监听器使用
   */
  isExecutingUndoRedo(): boolean {
    return this.isUndoRedoInProgress || this.isInvalidatingRedo || this.syncDepth > 0;
  }

  /**
   * 在同步上下文中执行操作
   * 同步期间的变更不会影响 undo/redo 栈
   *
   * 深度计数可重入：并发调用时，先完成的一个 finally 只把深度减一，
   * 不会把仍在进行中的另一个同步误判为「已结束」
   *
   * @param fn - 要执行的异步函数
   * @returns 函数执行结果
   */
  async syncing<T>(fn: () => Promise<T>): Promise<T> {
    this.syncDepth += 1;
    try {
      return await fn();
    } finally {
      this.syncDepth -= 1;
    }
  }

  /**
   * 使 redo 栈失效
   *
   * 实现标准 undo/redo 语义：当用户在 undo 后执行新操作时，清空 redo 栈。
   *
   * @remarks
   * **触发时机**
   * - 监听 ENTITY_LOCAL_CREATE_EVENT 事件，当新的 RxDBChange 记录创建时触发
   * - 通过 `isUndoRedoInProgress` 标志排除 undo/redo 操作本身
   * - 通过 `isInvalidatingRedo` 标志防止递归（该方法会触发 switchBranch → ENTITY_LOCAL_CREATE_EVENT）
   *
   * **实现步骤**
   * 1. 从内存 redo 栈获取所有可重做的历史项
   * 2. 构造 actions：更新这些变更的 `redoInvalidatedAt` 字段
   * 3. 使用 switchBranch 批量更新数据库
   * 4. 清空内存 redo 栈
   *
   * **为什么使用 switchBranch**
   * - 复用变更管理基础设施，保持代码一致性
   * - 正确触发事件系统，更新所有 Observable
   * - 在数据库中保留审计记录（redoInvalidatedAt 标记）
   *
   * @example
   * ```
   * // 用户操作：创建 A → 创建 B → undo B → 创建 C
   * // 结果：B.redoInvalidatedAt = C.createdAt，redo 栈清空
   * ```
   *
   * @param triggerChangeIds - 触发本次失效的 RxDBChange id 列表。全部不超过
   * {@link #redoInvalidationFloor} 时视为 undo 前旧写入的**迟到通知**，跳过失效；
   * 省略或为空时按新写入处理（保守清栈）。
   *
   * @internal 由 VersionManager 的事件监听器调用
   */
  async invalidateRedoStack(triggerChangeIds?: readonly number[]): Promise<void> {
    return this.#runSerialized(async () => {
      // 锁内仍保留快速跳过：上一次操作（如另一次 invalidate）已清空，这次直接返回
      if (this.isUndoRedoInProgress || this.isInvalidatingRedo) {
        return;
      }
      // 内容判定优先于时间窗：迟到的旧 change 通知（id 未越过 undo 时的序列水位）
      // 不代表用户的新操作，清栈会让紧随 undo 的 redo 静默空跑（见 #redoInvalidationFloor）。
      if (triggerChangeIds?.length && triggerChangeIds.every(id => id <= this.#redoInvalidationFloor)) {
        return;
      }

      this.isInvalidatingRedo = true;
      try {
        // 1. 从 redo 栈获取所有可重做的历史项
        const redoHistories = await firstValueFrom(this.redoHistories$);
        if (redoHistories.length === 0) return;

        // 2. 提取所有需要废弃的 RxDBChange
        const redoableChanges = redoHistories.flatMap(h => h.changes);

        // 3. 构造 actions：更新这些 changes 的 redoInvalidatedAt
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

        // 4. 使用 switchBranch 机制执行更新（保持在当前分支）
        const currentBranch = await this.rxdb.versionManager.getCurrentBranch();
        await adapter.switchBranch({
          branchId: currentBranch.id,
          actions
        });

        // 5. 主动清空内存 redo 栈
        this.clearRedoStack();
      } catch (error) {
        console.error('[HistoryManager] Failed to invalidate redo stack:', error);
        throw error;
      } finally {
        this.isInvalidatingRedo = false;
      }
    });
  }

  /**
   * 工厂方法：创建特定作用域的历史记录 API
   *
   * @param options - 作用域选项：
   *   - 不传参数 → database 作用域
   *   - EntityType 类 → repository 作用域
   *   - 实体实例（有 id）→ entity 作用域
   *   - HistoryScope 对象 → 显式指定作用域（用于测试和高级场景）
   * @returns 统一的历史记录 API 接口
   *
   * @remarks
   * **缓存与生命周期**
   * - 相同作用域的多次调用返回同一个实例，共享 Observable 链
   * - 使用引用计数自动管理缓存：当所有订阅者取消订阅时，自动清理缓存
   * - 键格式：'database' | 'namespace:entity' | 'namespace:entity:id'
   *
   * **工厂模式**
   * - 使用工厂模式消除特殊情况，所有作用域返回相同接口
   * - Observable 使用 shareReplay(1, refCount: true) 实现引用计数
   *
   * @example
   * ```ts
   * // 1. 简化 API
   * const dbHistory = versionManager.history();                    // database
   * const userHistory = versionManager.history(User);             // repository
   * const entityHistory = versionManager.history(userInstance);   // entity
   *
   * // 2. 相同作用域返回相同实例（缓存）
   * const h1 = versionManager.history(User);
   * const h2 = versionManager.history(User);
   * console.log(h1 === h2); // true
   *
   * // 3. 自动清理：当所有订阅者取消订阅时，缓存自动清除
   * const sub = h1.histories$.subscribe(...);
   * sub.unsubscribe(); // 如果是最后一个订阅者，缓存将被清理
   *
   * // 4. 显式 API（用于测试）
   * const dbHistory = undoRedo.history({ type: 'database' });
   * ```
   */
  history<T extends EntityType>(options?: T | InstanceType<T> | HistoryScope): HistoryScopeAPI {
    let scope: HistoryScope = { type: 'database' };

    if (options) {
      // 检查是否为 HistoryScope 对象（显式 API）
      if (Object.getPrototypeOf(options) === Object.prototype && 'type' in options) {
        scope = options as HistoryScope;
      } else {
        // 简化 API：EntityType 类或实例
        const metadata = getEntityMetadata(options as T | InstanceType<T>);
        const id = 'id' in options ? (options as { id: unknown }).id : undefined;
        const entityId: RxDBEntityId | undefined =
          typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint' ? id : undefined;
        if (entityId !== undefined) {
          scope = {
            type: 'entity',
            namespace: metadata.namespace,
            entity: metadata.name,
            entityId
          };
        } else {
          scope = {
            type: 'repository',
            namespace: metadata.namespace,
            entity: metadata.name
          };
        }
      }
    }

    // 生成缓存键
    const cacheKey = getScopeKey(scope);

    // 检查缓存（如果缓存存在）
    if (this.history_cache) {
      const cached = this.history_cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 创建清理函数（当最后一个订阅者取消订阅时调用）
    const cleanup = () => {
      if (!this.history_ref_counts || !this.history_cache) return;
      const count = (this.history_ref_counts.get(cacheKey) || 0) - 1;
      if (count <= 0) {
        this.history_cache.delete(cacheKey);
        this.history_ref_counts.delete(cacheKey);
      } else {
        this.history_ref_counts.set(cacheKey, count);
      }
    };

    // 注册引用（当有新订阅者时调用）
    const addRef = () => {
      if (!this.history_ref_counts) return;
      const count = (this.history_ref_counts.get(cacheKey) || 0) + 1;
      this.history_ref_counts.set(cacheKey, count);
    };

    // 包装 Observable，在订阅时增加引用计数、退订时清理
    // 引用计数统一由本包装器对称管理（addRef / cleanup 成对出现），
    // 避免在 source 上再挂 finalize(cleanup) 造成计数失衡
    const wrapObservable = <T>(source: Observable<T>): Observable<T> => {
      return new Observable(subscriber => {
        addRef();
        const sub = source.subscribe(subscriber);
        return () => {
          sub.unsubscribe();
          cleanup();
        };
      });
    };

    // 1. 创建过滤后的历史流（内部基础流，供 count 复用；引用计数交由 wrapObservable 管理）
    const base_histories$ = this.histories$.pipe(
      map(histories => filterHistoriesByScope(histories, scope)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    const scoped_histories$ = wrapObservable(base_histories$);

    // 2. 派生可撤销历史流（从 undoHistories$ 派生，继承 lastPushedChangeId 过滤）
    const scoped_undo_histories$ = wrapObservable(
      this.undoHistories$.pipe(
        map(histories => filterHistoriesByScope(histories, scope)),
        shareReplay({ bufferSize: 1, refCount: true })
      )
    );

    // 3. 派生可重做历史流（从内存栈过滤）
    const scoped_redo_histories$ = wrapObservable(
      this.redoHistories$.pipe(
        map(histories => filterHistoriesByScope(histories, scope)),
        shareReplay({ bufferSize: 1, refCount: true })
      )
    );

    // 4. 派生数量流
    const scoped_count$ = wrapObservable(
      base_histories$.pipe(
        map(h => h.length),
        shareReplay({ bufferSize: 1, refCount: true })
      )
    );

    const scoped_undo_count$ = wrapObservable(
      scoped_undo_histories$.pipe(
        map(h => h.length),
        shareReplay({ bufferSize: 1, refCount: true })
      )
    );

    const scoped_redo_count$ = wrapObservable(
      scoped_redo_histories$.pipe(
        map(h => h.length),
        shareReplay({ bufferSize: 1, refCount: true })
      )
    );

    // 5. 创建 API 实例并缓存
    const api: HistoryScopeAPI = {
      type: scope.type,
      histories$: scoped_histories$,
      undoHistories$: scoped_undo_histories$,
      redoHistories$: scoped_redo_histories$,
      count$: scoped_count$,
      undoCount$: scoped_undo_count$,
      redoCount$: scoped_redo_count$,

      undo: (step = 1) =>
        this.#runSerialized(async () => {
          const undoSession = this.#undoSession$.value;
          if (undoSession.state === 'cleared') return;

          const { histories, lastPushedMap } = await this.#fetch_latest_histories(undoSession.boundary);
          if (!this.#isUndoSessionCurrent(undoSession)) return;

          const undoable = filterUndoableHistories(
            histories,
            lastPushedMap,
            undoSession.boundary.changeId,
            undoSession.boundary.createdAfter
          );
          const toUndo = this.#selectWholeTransactions(undoable, scope, step);
          if (toUndo.length === 0) return;
          await this.#apply_undo_redo_histories('undo', toUndo, undoSession);
        }),

      redo: (step = 1) =>
        this.#runSerialized(async () => {
          const histories = await firstValueFrom(this.redoHistories$);
          const toRedo = this.#selectWholeTransactions(histories, scope, step);
          if (toRedo.length === 0) return;
          await this.#apply_undo_redo_histories('redo', toRedo);
        })
    };

    if (this.history_cache) {
      this.history_cache.set(cacheKey, api);
    }
    return api;
  }

  /**
   * 挑出该作用域接下来要应用的历史项，并挡住会被截断的跨作用域事务
   *
   * @remarks
   * 此前是 `filterHistoriesByScope(...).slice(0, step)`：过滤器为了展示会把事务裁成
   * 「与本作用域有关的那几条」，`undo()` 拿着裁完的结果直接应用，于是一个跨实体事务
   * 只被回滚了一半，留下一个从未存在过的中间态。
   *
   * 现在选择与展示分开：这里返回**完整未裁剪**的事务，凡是越界的一律抛
   * {@link RxDBCrossScopeTransactionError}——理由见 `scope-selection.ts`。
   */
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
   * 活跃分支流断掉时的上报口。
   *
   * @remarks
   * 这两条订阅是 HistoryManager 自己开的，没有调用方可以把错误交回去。不给 `error` 回调，
   * RxJS 会走 `reportUnhandledError` —— 浏览器里是 `window.onerror`，Electron 里直接是一次
   * 未捕获异常，足以把宿主应用打崩。而这里最常见的错误来源恰恰是 `RxDB.connect()` 失败：
   * 活查询在适配器的就绪门上等的就是那个 promise，连接失败它就跟着 error。那个错误
   * 调用方已经从 `connect()` 拿到过一次，再把进程崩一次不提供任何新信息。
   *
   * 不是吞掉：错误照样落日志，并推给 {@link HistoryManager.errors$} 的订阅者，
   * 与 `#updatePushableCount` 的降级口径一致。
   *
   * 已知局限：流在 error 之后即终止，分支跟随与 pushableCount 不会自行恢复。
   * 失败的连接重试成功后，这两条流仍是死的，需要重建 RxDB 实例。
   *
   * @param source - 出错的流，用于日志定位
   * @param error - 原始错误
   */
  #reportBranchStreamError(source: string, error: unknown): void {
    // 关机竞态：destroy 后仍在 in-flight 的查询会撞到断连的 adapter，属预期行为
    if (this.#destroyed || isAdapterShutdownError(error)) return;
    console.error(`[HistoryManager] ${source} 的活跃分支流已中断:`, error);
    this.errors$.next(error instanceof Error ? error : new Error(String(error)));
  }

  /**
   * 把 session 视图切到新的活跃分支
   *
   * @remarks
   * 分支还没解析出来时发生的 clear / reset 归属第一个解析出来的分支——它们描述的正是
   * 那次连接上正在发生的同步，丢掉会让边界白推一次。
   */
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

  /**
   * 把异步任务排队执行，保证 invalidateRedoStack / undo / redo 之间串行
   *
   * 失败的任务不会阻塞后续任务（catch(() => undefined)），但会向调用方抛出。
   */
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

  /**
   * 直接从数据库查询最新变更并转换为历史项
   *
   * @returns 最新的历史项数组 + repository 级 lastPushedChangeId 水位线映射
   *
   * @remarks
   * 绕过 Observable 缓存，确保 undo/redo 操作使用最新数据。
   * Observable 可能存在异步延迟，直接查询避免状态不一致。
   *
   * DB 查询只下推不会切断事务的单调 id 边界；时间边界必须在事务分组后整组判断。
   * repository 水位线由 lastPushedMap + filterUndoableHistories 精确过滤。
   */
  async #fetch_latest_histories(
    undoBoundary: UndoBoundary
  ): Promise<{ histories: HistoryItem[]; lastPushedMap: Map<string, number> }> {
    const { changeRepository: adapter, branchRepository } = await this.rxdb.versionManager.getLocalRepositories();

    // 获取当前活跃分支
    const branches = await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      }
    });

    if (branches.length === 0) {
      return { histories: [], lastPushedMap: new Map() };
    }

    const branch = branches[0];

    // 从 RxDBSync 收集各 repository 的 lastPushedChangeId 水位线
    const localAdapter = await firstValueFrom(this.rxdb.localAdapter$);
    const repoSyncRepo = getLocalRxDBSyncRepository(localAdapter);
    const repoSyncs = await repoSyncRepo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'branchId', operator: '=', value: branch.id }]
      }
    });

    const lastPushedMap = new Map<string, number>();
    for (const rs of repoSyncs) {
      if (rs.lastPushedChangeId !== null) {
        lastPushedMap.set(getRepositoryKey(rs), rs.lastPushedChangeId);
      }
    }

    const rules: RxDBChangeRuleGroup['rules'] = [
      {
        field: 'branchId',
        operator: '=',
        value: branch.id
      },
      {
        field: 'createdAt',
        operator: '>=',
        value: this.#getFirstConnectedAt()
      }
    ];
    if (undoBoundary.changeId > 0) {
      rules.push({ field: 'id', operator: '>', value: undoBoundary.changeId });
    }
    const allChanges = await adapter.find({
      where: {
        combinator: 'and',
        rules
      },
      orderBy: [{ field: 'id', sort: 'desc' }]
    });

    return { histories: convertChangesToHistories(allChanges), lastPushedMap };
  }

  readonly #onRepositorySyncComplete = () => {
    this.#updatePushableCount();
    this.#pushableCountTrigger$.next(Date.now());
  };

  // #convert_changes_to_histories / #create_history_item 已抽离到 history-item-builder.ts

  /**
   * 应用 undo/redo 历史记录
   *
   * @param operation - 操作类型：'undo' 撤销 | 'redo' 重做
   * @param histories - 要应用的历史记录
   *
   * @remarks
   * 流程：
   * 1. 提取并排序变更（undo 倒序，redo 正序）
   * 2. 转换为 switchBranch actions
   * 3. 更新 RxDBChange 元数据（revertChangeId 等）
   * 4. 执行 switchBranch 应用变更
   * 5. 更新内存栈（undo 推入 redo 栈，redo 弹出 redo 栈）
   */
  async #apply_undo_redo_histories(
    operation: 'undo' | 'redo',
    histories: HistoryItem[],
    undoSession?: ActiveUndoSession
  ): Promise<void> {
    this.isUndoRedoInProgress = true;

    try {
      // 1. 提取并排序 changes
      const changes = histories
        .flatMap(h => h.changes)
        .sort((a, b) => (operation === 'undo' ? b.id - a.id : a.id - b.id));

      // 2. 转换为 actions
      const actions = get_switch_version_actions(changes, operation === 'redo');
      const stateUpdatedAt = this.#getNextRevertStateUpdatedAt(changes);

      // 3. 更新 RxDBChange 元数据
      if (operation === 'undo') {
        const { adapter } = await this.rxdb.versionManager.getLocalRepositories();
        const seq = await adapter.getRxDBChangeSequence();
        const revertChangedAt = new Date();

        changes.forEach((change, index) => {
          const changeKey = `rxdb:RxDBChange:${change.id}`;
          const existingUpdate = actions.updates.get(changeKey) || { patch: {}, inversePatch: null };
          actions.updates.set(changeKey, {
            patch: {
              ...existingUpdate.patch,
              revertChangeId: seq + index + 1,
              revertChangedAt,
              updatedAt: stateUpdatedAt
            },
            inversePatch: existingUpdate.inversePatch
          });
        });
        actions.updateRxDBChangeSequence = seq + changes.length;
        // 序列已推进：此后只有 id 越过该水位的 change-INSERT 事件才是真正的新写入
        this.#redoInvalidationFloor = seq + changes.length;
      } else {
        // redo: 清除 revertChangeId
        changes.forEach(change => {
          const changeKey = `rxdb:RxDBChange:${change.id}`;
          const existingUpdate = actions.updates.get(changeKey) || { patch: {}, inversePatch: null };
          actions.updates.set(changeKey, {
            patch: {
              ...existingUpdate.patch,
              revertChangeId: null,
              updatedAt: stateUpdatedAt
            },
            inversePatch: existingUpdate.inversePatch
          });
        });
      }

      // 4. 执行操作
      const { adapter } = await this.rxdb.versionManager.getLocalRepositories();
      const currentBranch = await this.rxdb.versionManager.getCurrentBranch();
      if (operation === 'undo') {
        if (undoSession === undefined || !this.#isUndoSessionCurrent(undoSession)) return;
      }
      await adapter.switchBranch({
        branchId: currentBranch.id,
        actions
      });

      // switchBranch 内部通过 transaction_sqlite_result(forcedUpdate=true) 同步更新了
      // 缓存实体的 revertChangeId，但 QueryManager 的事件处理由 performChunk 异步调度，
      // 导致 histories$ 延迟重新发射。触发 trigger 可使 undoHistories$ 立即用已更新
      // 的实体对象重新过滤，无需等待 requestIdleCallback。
      this.#pushableCountTrigger$.next(Date.now());

      this.#setRevertStateWatermarks(changes, operation === 'undo', stateUpdatedAt);

      // 5. 更新栈
      if (operation === 'undo') {
        this.pushToRedoStack(histories);
      } else {
        // 按身份移除刚刚 redo 的那些项——作用域 redo 筛出的项未必在栈顶
        this.removeFromRedoStack(histories);
      }
    } finally {
      this.isUndoRedoInProgress = false;
    }
  }

  /**
   * 异步更新 pushableCount（使用 repository-level lastPushedChangeId 过滤）
   * @private
   */
  async #updatePushableCount(): Promise<void> {
    const generation = ++this.#pushableGeneration;
    // 只有仍是最新那次刷新才有资格改写计数：晚到的旧结果（含降级为 0）一律丢弃
    const publish = (count: number): void => {
      if (generation === this.#pushableGeneration) {
        this.#pushableCount$.next(count);
      }
    };

    try {
      const connected = await firstValueFrom(this.rxdb.connected$);
      if (!connected) {
        publish(0);
        return;
      }

      const localAdapter = await firstValueFrom(this.rxdb.localAdapter$);
      const RxDBSyncRepo = getLocalRxDBSyncRepository(localAdapter);
      const changeRepository = this.rxdb.entityManager.getRepository(RxDBChange);
      const branch = await firstValueFrom(
        this.rxdb.entityManager.getRepository(RxDBBranch).findOne({
          where: {
            combinator: 'and',
            rules: [{ field: 'activated', operator: '=', value: true }]
          }
        })
      );

      if (!branch) {
        publish(0);
        return;
      }

      // 获取当前分支的所有 repository 同步记录
      const repoSyncs = await RxDBSyncRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'branchId', operator: '=', value: branch.id }]
        }
      });

      const repoRules = this.#buildPushableRepositoryRules(repoSyncs);
      if (repoRules.length === 0) {
        // 一个可推送仓库都没有 —— 没有理由再发一次统计查询
        publish(0);
        return;
      }

      // 单次查询统计所有 repository 的变更数
      const count = await firstValueFrom(
        changeRepository.count({
          where: {
            combinator: 'and',
            rules: [
              { field: 'branchId', operator: '=', value: branch.id },
              { field: 'revertChangeId', operator: '=', value: null },
              { field: 'remoteId', operator: '=', value: null },
              {
                combinator: 'or',
                rules: repoRules
              }
            ]
          }
        })
      );

      publish(count);
    } catch (error) {
      // 关机竞态：destroy 后仍在 in-flight 的查询会撞到断连的 adapter，属预期行为
      if (!this.#destroyed && !isAdapterShutdownError(error)) {
        console.error('[#updatePushableCount] error', error);
        // 与 undoHistories$ 对齐：降级为 0 的同时把错误推给 errors$ 订阅者
        this.errors$.next(error instanceof Error ? error : new Error(String(error)));
      }
      publish(0);
    }
  }

  /**
   * 按「当前配置里有推送资格的仓库」构造 OR 组，同步记录只提供水位线
   *
   * @param repoSyncs - 当前分支上已存在的同步记录
   * @returns 每个可推送仓库一条 AND 规则；没有仓库可推送时返回空数组
   *
   * @remarks
   * 仓库集合的唯一真源是 `config.entities × syncType`（口径见 {@link getSyncCapability}），
   * 不是「已经有 RxDBSync 记录的仓库」。旧实现两条分支都错：没有任何记录时退化成统计
   * **全部**本地变更（把 local-only 实体也算进去），有记录时又只按记录构造 OR 组
   * （从未推送过的仓库整个漏算）。记录在这里只回答一个问题 —— 水位线在哪、开关关没关。
   *
   * 没有记录 ⇒ 该仓库一次都没推过 ⇒ 不设上界，本分支上它的变更全都待推。
   */
  #buildPushableRepositoryRules(repoSyncs: RxDBSync[]): RuleGroup<RxDBChange>['rules'] {
    const syncByRepository = new Map(repoSyncs.map(repoSync => [`${repoSync.namespace}:${repoSync.entity}`, repoSync]));
    const rules: RuleGroup<RxDBChange>['rules'] = [];

    for (const EntityClass of this.rxdb.config.entities) {
      const metadata = getEntityMetadata(EntityClass);
      if (!getSyncCapability(getSyncType(metadata, this.rxdb.config.sync)).push) continue;

      // `enabled = false` 一票否决。计数不跟着走，界面就会报「有 N 条待推」而 push 一条不发
      const repoSync = syncByRepository.get(`${metadata.namespace}:${metadata.name}`);
      if (!isRepositorySyncEnabled(repoSync)) continue;

      const repoRules: RuleGroup<RxDBChange>['rules'] = [
        { field: 'namespace', operator: '=', value: metadata.namespace },
        { field: 'entity', operator: '=', value: metadata.name }
      ];
      const watermark = repoSync?.lastPushedChangeId;
      if (watermark !== null && watermark !== undefined) {
        repoRules.push({ field: 'id', operator: '>', value: watermark });
      }

      rules.push({ combinator: 'and', rules: repoRules });
    }

    return rules;
  }
}

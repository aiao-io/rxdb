/**
 * @fileoverview 同步状态汇聚面
 *
 * 把「网通不通、还有多少没推上去、这会儿正在推吗、上一次错在哪、上一次是谁判负」
 * 五件事收成一份快照，供三框架的 `useSyncState()` 直接绑到渲染上。
 *
 * 本模块只做汇聚，不做查询：数据源由 {@link SyncStateSources} 注入，
 * 真正的 DB 读取留在各自的归属模块里（可达性在 `network/reachability.ts`，
 * changelog 待推数在 `HistoryManager`，QueryCache 出站数在 `repository/query-cache-outbox.ts`）。
 * 这样这一层可以用普通 Subject 完整测出来，不必搭一整个 RxDB。
 */

import { BehaviorSubject, combineLatest, type Observable, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

/**
 * 一次冲突判定的结果，冲突发生处上报用
 */
export interface SyncConflictReport {
  /** 实体命名空间 */
  namespace: string;
  /** 实体名 */
  entity: string;
  /** 判定涉及的实体主键 */
  entityId: string;
  /** 谁赢了：`remote` 意味着离线期间的本地改动被丢弃 */
  winner: 'local' | 'remote';
}

/**
 * 带发生时刻的冲突记录
 */
export interface SyncConflict extends SyncConflictReport {
  /** 判定时刻 */
  at: Date;
}

/**
 * 同步状态快照
 */
export interface SyncState {
  /** 远端当前是否可达 */
  online: boolean;
  /** 两条推送路径合计仍未推到远端的变更数 */
  pendingCount: number;
  /** 是否有一轮回推正在进行 */
  syncing: boolean;
  /** 上一次回推失败；成功一轮后清空 */
  lastError: Error | null;
  /** 上一次冲突判定；不会被后续成功清空，它是历史事实 */
  lastConflict: SyncConflict | null;
}

/**
 * {@link SyncStateHub} 的上游数据源
 *
 * @remarks
 * 两条流互相独立订阅，任何一条是冷流（或一直不发值）都不会拖住另一条 ——
 * 用 `combineLatest` 会要求两条都先发过值，接一条冷流就能让整个面板永远停在初值。
 *
 * QueryCache 的出站数不在这里：它没有天然的实时流（水位线存在 `rxdb_sync`，
 * 推进时不会写 `rxdb_change`，实时查询看不见），改由同步机制在两个已知时机主动上报，
 * 见 {@link SyncStateHub.reportOutboxCount}。
 */
export interface SyncStateSources {
  /** 远端可达性，来自 `ReachabilityMonitor.online$` */
  online$: Observable<boolean>;
}

/** 上游都没发过值时的读数 */
const INITIAL_STATE: SyncState = {
  online: true,
  pendingCount: 0,
  syncing: false,
  lastError: null,
  lastConflict: null
};

/** 逐字段比较两份快照 */
const sameState = (a: SyncState, b: SyncState): boolean =>
  a.online === b.online &&
  a.pendingCount === b.pendingCount &&
  a.syncing === b.syncing &&
  a.lastError === b.lastError &&
  a.lastConflict === b.lastConflict;

/** 把回推链吞到的任意值规范成 Error */
const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * 同步状态汇聚器
 *
 * @remarks
 * 上游三条流只读；`syncing` / `lastError` / `lastConflict` 由回推链主动上报
 * （{@link beginRound}、{@link reportError}、{@link reportConflict} 等）。
 *
 * {@link destroy} 只断开上游订阅，不关闭 {@link state$} —— 关掉的话，销毁瞬间
 * 还挂在上面的框架组件会读到一个已完成的流，渲染成空面板。保留最后一份快照更接近事实。
 *
 * @example
 * ```ts
 * const sub = rxdb.syncState.state$.subscribe(state => {
 *   banner.textContent = state.online ? `待推 ${state.pendingCount}` : '离线';
 * });
 * ```
 */
export class SyncStateHub {
  readonly #upstream$ = new BehaviorSubject<{ online: boolean; pushableCount: number; outboxCount: number }>({
    online: INITIAL_STATE.online,
    pushableCount: 0,
    outboxCount: 0
  });
  readonly #syncing$ = new BehaviorSubject<boolean>(false);
  readonly #lastError$ = new BehaviorSubject<Error | null>(null);
  readonly #lastConflict$ = new BehaviorSubject<SyncConflict | null>(null);
  readonly #state$ = new BehaviorSubject<SyncState>(INITIAL_STATE);
  /** 「重算待拉数」的请求跳板；没人接线时发进空里，正是无插件时该有的行为 */
  readonly #pullableRefresh$ = new Subject<void>();
  readonly #subscriptions = new Subscription();

  /** 汇总快照流；订阅即得当前值 */
  readonly state$: Observable<SyncState> = this.#state$.asObservable();

  /** 当前快照，供不便订阅的同步读取场景使用 */
  get snapshot(): SyncState {
    return this.#state$.value;
  }

  constructor(sources: SyncStateSources) {
    this.#subscriptions.add(
      sources.online$.subscribe(online => this.#upstream$.next({ ...this.#upstream$.value, online }))
    );

    const derived$ = combineLatest([this.#upstream$, this.#syncing$, this.#lastError$, this.#lastConflict$]).pipe(
      map(([upstream, syncing, lastError, lastConflict]) => ({
        online: upstream.online,
        pendingCount: upstream.pushableCount + upstream.outboxCount,
        syncing,
        lastError,
        lastConflict
      })),
      distinctUntilChanged(sameState)
    );
    this.#subscriptions.add(derived$.subscribe(state => this.#state$.next(state)));
  }

  /**
   * 接上 changelog 路径的待推数流，返回解绑函数
   *
   * @param source$ - 待推数流，通常是 `HistoryManager.pushableCount$`
   * @returns 解绑函数：断订阅并把这一路的读数清零
   *
   * @remarks
   * **不是构造参数**：changelog 路径整个住在 `@aiao/rxdb-plugin-history` 里（US-025 阶段 C），
   * 它的生命周期是**连接纪元**（`scoped` 插件在 `connect()` 时安装、断连时随作用域逆序释放），
   * 而本汇聚器跟随实例、跨断连存活 —— 面板要在断连期间继续显示上一份读数。
   * 两者寿命不同，只能由插件在安装时接上、在释放时解开。
   *
   * 解绑时**清零而不是保留最后一个数**：插件都拆了，那个数字背后已经没有任何东西在维护它；
   * 留着会让「没装历史插件」和「装了但一条都没待推」在面板上长得一模一样。
   * QueryCache 出站数走 {@link reportOutboxCount}，不受这里影响。
   */
  bindPushableCount(source$: Observable<number>): () => void {
    const subscription = source$.subscribe(pushableCount =>
      this.#upstream$.next({ ...this.#upstream$.value, pushableCount })
    );
    // 也挂进 `#subscriptions`：插件先于 hub 释放是常态，但反过来（hub 先 `destroy()`）
    // 不能留一条还在往死 hub 里写数的订阅。解绑时再 `remove()` 摘掉，
    // 否则反复重连会在父订阅里堆一串已死的子订阅。
    this.#subscriptions.add(subscription);
    return () => {
      this.#subscriptions.remove(subscription);
      subscription.unsubscribe();
      this.#upstream$.next({ ...this.#upstream$.value, pushableCount: 0 });
    };
  }

  /**
   * 请求重算待拉数
   *
   * @remarks
   * 由**远端适配器**在实时订阅恢复后调用（`@aiao/rxdb-adapter-supabase` 的
   * `SUBSCRIBED` 回调）：断线期间远端攒下的变更本地一条都没听见，重新订阅只保证
   * 「从现在起听得见」，不补历史，所以必须回头按各仓库的水位线重数一遍。
   *
   * **只是个请求，不是执行**。真正重数的那段逻辑要读各仓库的同步记忆，整个住在
   * `@aiao/rxdb-plugin-history` 里（US-025 阶段 C），适配器不许认识它 —— 反过来也一样。
   * 没装历史插件时这里是**无操作**：待拉数本来就无人维护，请求一个没有归宿的重算
   * 不该让实时订阅的恢复路径炸掉。
   */
  requestPullableRefresh(): void {
    this.#pullableRefresh$.next();
  }

  /**
   * 接上「重算待拉数」的执行者，返回解绑函数
   *
   * @param refresh - 执行重算的回调，通常是 `VersionManager.refreshPullableCount()` 的包装
   * @returns 解绑函数
   *
   * @remarks
   * 与 {@link bindPushableCount} 同构、同理由：执行者跟随**连接纪元**（`scoped` 插件），
   * 而本汇聚器跟随实例，只能由插件在安装时接上、在释放时解开。
   *
   * 回调**不得抛出、不得返回待处理的拒绝**：这里是即发即忘的信号跳板，
   * 既没有调用方能接住错误，也没有位置能重试。错误处理归执行者自己。
   */
  bindPullableRefresh(refresh: () => void): () => void {
    const subscription = this.#pullableRefresh$.subscribe(refresh);
    // 与 `bindPushableCount` 同：挂进 `#subscriptions`，`destroy()` 先走一步时
    // 不会留一条还在往已拆的插件里打的订阅。
    this.#subscriptions.add(subscription);
    return () => {
      this.#subscriptions.remove(subscription);
      subscription.unsubscribe();
    };
  }

  /**
   * 上报 QueryCache 路径当前的出站待推数（绝对值）
   *
   * @remarks
   * 这个数只在两个时机会变：离线写入队（{@link reportOfflineWrite}），以及一轮回推
   * 推进了水位线。两处都会上报，因此「按事件上报」在这里是完备的，而不是对实时流的将就。
   *
   * 与 {@link reportOfflineWrite} 的分工：那个只知道「又多一条」，这个是回推收尾时
   * 重数一遍的权威值，会把此前累加出来的数整个覆盖掉。
   */
  reportOutboxCount(count: number): void {
    this.#upstream$.next({ ...this.#upstream$.value, outboxCount: count });
  }

  /**
   * 上报一次离线写入队
   *
   * @remarks
   * 写路径只知道自己刚排了一条，不知道总数 —— 为了一个确定的 `+1` 再去数一遍全表，
   * 是拿一次库读换一个已知的答案。权威值由回推收尾时的重算给出。
   */
  reportOfflineWrite(): void {
    const upstream = this.#upstream$.value;
    this.#upstream$.next({ ...upstream, outboxCount: upstream.outboxCount + 1 });
  }

  /** 一轮回推开始 */
  beginRound(): void {
    this.#syncing$.next(true);
  }

  /** 一轮回推结束，无论成败 */
  endRound(): void {
    this.#syncing$.next(false);
  }

  /** 上报本轮的一次失败 */
  reportError(error: unknown): void {
    this.#lastError$.next(toError(error));
  }

  /** 上报一轮全程无失败，清掉上一次的错误 */
  reportSuccess(): void {
    this.#lastError$.next(null);
  }

  /** 上报一次冲突判定 */
  reportConflict(report: SyncConflictReport): void {
    this.#lastConflict$.next({ ...report, at: new Date() });
  }

  /** 断开上游订阅；{@link state$} 保留最后一份快照 */
  destroy(): void {
    this.#subscriptions.unsubscribe();
  }
}

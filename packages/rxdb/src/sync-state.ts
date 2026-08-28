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

import { BehaviorSubject, combineLatest, type Observable, Subscription } from 'rxjs';
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
  /** changelog 路径待推数，来自 `HistoryManager.pushableCount$` */
  pushableCount$: Observable<number>;
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
  readonly #subscriptions = new Subscription();

  /** 汇总快照流；订阅即得当前值 */
  readonly state$: Observable<SyncState> = this.#state$.asObservable();

  constructor(sources: SyncStateSources) {
    this.#subscriptions.add(
      sources.online$.subscribe(online => this.#upstream$.next({ ...this.#upstream$.value, online }))
    );
    this.#subscriptions.add(
      sources.pushableCount$.subscribe(pushableCount => this.#upstream$.next({ ...this.#upstream$.value, pushableCount }))
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

  /** 当前快照，供不便订阅的同步读取场景使用 */
  get snapshot(): SyncState {
    return this.#state$.value;
  }

  /**
   * 上报 QueryCache 路径当前的出站待推数
   *
   * @remarks
   * 这个数只在两个时机会变：离线写入队（+1），以及一轮重放推进了水位线（−N）。
   * 两处都会调用本方法，因此「按事件上报」在这里是完备的，而不是对实时流的将就。
   */
  reportOutboxCount(count: number): void {
    this.#upstream$.next({ ...this.#upstream$.value, outboxCount: count });
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

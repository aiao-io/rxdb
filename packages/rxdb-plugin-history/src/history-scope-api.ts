import {
  EntityType,
  getEntityMetadata,
  type HistoryItem,
  type HistoryScope,
  type HistoryScopeAPI,
  RxDBEntityId
} from '@aiao/rxdb';
import { distinctUntilChanged, map, Observable, shareReplay } from 'rxjs';
import {
  type ChildFork,
  filterHistoriesByScope,
  getScopeKey,
  type HistoryBarrier,
  historyBarrierOf,
  inheritedFloorOf,
  isHistoryShownInScope,
  partitionUndoableHistories,
  splitRedoableHistories,
  type UndoablePartition
} from './history-filters.js';
import type { ActiveUndoSession, UndoBoundary, UndoSession } from './history-undo-session.types.js';

/** 当前分支的撤销状态：两组历史（整库口径），连同算它们用的子分支分叉点 */
export interface UndoState extends UndoablePartition {
  readonly forks: ChildFork[];
}

/** 原始重做栈（栈顶在前），连同当前分支的子分支分叉点 */
export interface RedoState {
  readonly stack: HistoryItem[];
  readonly forks: ChildFork[];
}

/** 拦住栈的原因是否相同：同一组子分支就不必再通知一次 */
const sameBarrier = (a: HistoryBarrier | null, b: HistoryBarrier | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.branchIds.length === b.branchIds.length &&
    a.branchIds.every((branchId, index) => branchId === b.branchIds[index]));

/**
 * `history()` 工厂所需的可变状态与委托。
 *
 * `history_cache` / `history_ref_counts` 是类持有的同一份 Map，sibling 的 set/delete 必须写回。
 */
export interface HistoryScopeApiHost {
  readonly history_cache: Map<string, HistoryScopeAPI>;
  readonly history_ref_counts: Map<string, number>;
  readonly histories$: Observable<HistoryItem[]>;
  readonly undoState$: Observable<UndoState>;
  readonly redoState$: Observable<RedoState>;
  readonly undoSession$: { readonly value: UndoSession };
  /** 原始重做栈的当前快照（栈顶在前） */
  redoStackSnapshot(): HistoryItem[];
  runSerialized<T>(task: () => Promise<T>): Promise<T>;
  fetchLatestHistories(boundary: UndoBoundary): Promise<{
    histories: HistoryItem[];
    lastPushedMap: Map<string, number>;
    forks: ChildFork[];
  }>;
  /** 直接查当前分支的子分支分叉点 */
  fetchChildForks(): Promise<ChildFork[]>;
  isUndoSessionCurrent(session: ActiveUndoSession): boolean;
  selectWholeTransactions(histories: HistoryItem[], scope: HistoryScope, step: number): HistoryItem[];
  applyUndoRedoHistories(
    operation: 'undo' | 'redo',
    histories: HistoryItem[],
    undoSession?: ActiveUndoSession
  ): Promise<void>;
}

/**
 * 解析 `history()` 入参：无参 → database；显式 HistoryScope；否则 EntityType / 实例。
 */
export function resolveHistoryScope<T extends EntityType>(options?: T | InstanceType<T> | HistoryScope): HistoryScope {
  if (!options) return { type: 'database' };
  if (Object.getPrototypeOf(options) === Object.prototype && 'type' in options) {
    return options as HistoryScope;
  }

  const metadata = getEntityMetadata(options as T | InstanceType<T>);
  const id = 'id' in options ? (options as { id: unknown }).id : undefined;
  const entityId: RxDBEntityId | undefined =
    typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint' ? id : undefined;
  if (entityId !== undefined) {
    return {
      type: 'entity',
      namespace: metadata.namespace,
      entity: metadata.name,
      entityId
    };
  }
  return {
    type: 'repository',
    namespace: metadata.namespace,
    entity: metadata.name
  };
}

/**
 * 创建（或从缓存取出）特定作用域的历史 API。
 *
 * @remarks
 * 引用计数由 wrapObservable 对称管理（addRef / cleanup 成对出现），不再挂 finalize。
 * 缓存条目的生死跟着引用计数走：第一个订阅者出现时入表，最后一个退订时摘掉。
 * 因此「只调方法不订阅」的用法不产生任何常驻状态 —— 它拿到的是个短命对象，
 * 用完即由 GC 回收。
 */
export function createHistoryScopeApi<T extends EntityType>(
  host: HistoryScopeApiHost,
  options?: T | InstanceType<T> | HistoryScope
): HistoryScopeAPI {
  const scope = resolveHistoryScope(options);
  const cacheKey = getScopeKey(scope);

  const cached = host.history_cache.get(cacheKey);
  if (cached) return cached;

  const cleanup = () => {
    const count = (host.history_ref_counts.get(cacheKey) || 0) - 1;
    if (count <= 0) {
      host.history_cache.delete(cacheKey);
      host.history_ref_counts.delete(cacheKey);
    } else {
      host.history_ref_counts.set(cacheKey, count);
    }
  };

  const addRef = () => {
    const count = (host.history_ref_counts.get(cacheKey) || 0) + 1;
    host.history_ref_counts.set(cacheKey, count);
    // 入表推迟到第一个订阅者出现，与 `cleanup` 的摘除严格对称。
    // 此前在函数末尾无条件入表：只调方法不订阅（`history(record).undo()`）的调用方
    // 引用计数永远是 0，`cleanup` 永远不跑，条目就永久留下 —— 而 cacheKey 是按
    // 记录 id 分的，每 undo 一条不同记录就多漏一条，没有上界。
    host.history_cache.set(cacheKey, api);
  };

  const wrapObservable = <U>(source: Observable<U>): Observable<U> =>
    new Observable(subscriber => {
      addRef();
      const sub = source.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        cleanup();
      };
    });

  const base_histories$ = host.histories$.pipe(
    map(histories => filterHistoriesByScope(histories, scope)),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  const scoped_histories$ = wrapObservable(base_histories$);

  // 被继承的历史项都比可撤销的早，作用域里最新的那一项就是撤销栈下一步会撞上的
  const scoped_undo_state$ = host.undoState$.pipe(
    map(({ undoable, inherited, forks }) => {
      const blockedBy = inherited.find(history => isHistoryShownInScope(history, scope));
      return {
        histories: filterHistoriesByScope(undoable, scope),
        barrier: blockedBy === undefined ? null : historyBarrierOf(blockedBy, forks)
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  const scoped_redo_state$ = host.redoState$.pipe(
    map(({ stack, forks }) => {
      const { redoable, blockedBy } = splitRedoableHistories(stack, scope, inheritedFloorOf(forks));
      return {
        histories: filterHistoriesByScope(redoable, scope),
        barrier: blockedBy === null ? null : historyBarrierOf(blockedBy, forks)
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  const scoped_undo_histories$ = wrapObservable(
    scoped_undo_state$.pipe(
      map(state => state.histories),
      shareReplay({ bufferSize: 1, refCount: true })
    )
  );
  const scoped_redo_histories$ = wrapObservable(
    scoped_redo_state$.pipe(
      map(state => state.histories),
      shareReplay({ bufferSize: 1, refCount: true })
    )
  );
  const scoped_undo_barrier$ = wrapObservable(
    scoped_undo_state$.pipe(
      map(state => state.barrier),
      distinctUntilChanged(sameBarrier),
      shareReplay({ bufferSize: 1, refCount: true })
    )
  );
  const scoped_redo_barrier$ = wrapObservable(
    scoped_redo_state$.pipe(
      map(state => state.barrier),
      distinctUntilChanged(sameBarrier),
      shareReplay({ bufferSize: 1, refCount: true })
    )
  );
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

  const api: HistoryScopeAPI = {
    type: scope.type,
    histories$: scoped_histories$,
    undoHistories$: scoped_undo_histories$,
    redoHistories$: scoped_redo_histories$,
    count$: scoped_count$,
    undoCount$: scoped_undo_count$,
    redoCount$: scoped_redo_count$,
    undoBarrier$: scoped_undo_barrier$,
    redoBarrier$: scoped_redo_barrier$,

    undo: (step = 1) =>
      host.runSerialized(async () => {
        const undoSession = host.undoSession$.value;
        if (undoSession.state === 'cleared') return;

        const { histories, lastPushedMap, forks } = await host.fetchLatestHistories(undoSession.boundary);
        if (!host.isUndoSessionCurrent(undoSession)) return;

        const { undoable } = partitionUndoableHistories(
          histories,
          lastPushedMap,
          undoSession.boundary.changeId,
          undoSession.boundary.createdAfter,
          inheritedFloorOf(forks)
        );
        const toUndo = host.selectWholeTransactions(undoable, scope, step);
        if (toUndo.length === 0) return;
        await host.applyUndoRedoHistories('undo', toUndo, undoSession);
      }),

    redo: (step = 1) =>
      host.runSerialized(async () => {
        // 分叉点现查：活查询可能还没跟上刚建的子分支
        const forks = await host.fetchChildForks();
        const { redoable } = splitRedoableHistories(host.redoStackSnapshot(), scope, inheritedFloorOf(forks));
        const toRedo = host.selectWholeTransactions(redoable, scope, step);
        if (toRedo.length === 0) return;
        await host.applyUndoRedoHistories('redo', toRedo);
      })
  };

  return api;
}

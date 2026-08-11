/**
 * T034 [US1] —— SearchHandle 工厂。
 *
 * 纯工厂：把状态机、防抖、查询执行函数、数据变更通道组装为 {@link SearchHandle}。
 * plugin.ts 只负责注入具体的 `performSearch` 和 entity event 订阅函数。
 *
 * 行为要点（contracts/plugin-search-api.md）：
 *  - `setQuery(q)`：入 debounced 通道，300ms 默认
 *  - `clear()`：立即置 idle，清空结果 / error / pagination
 *  - `retry()`：在 error 状态用 `lastQuery` 重入 loading
 *  - `loadMore()`：追加下一页；无更多时 no-op
 *  - `destroy()`：取消所有内部订阅
 *  - 数据源变更通知：绕过防抖直通 pipeline（`triggerSilentRefresh`）
 *
 * @packageDocumentation
 */

import {
  auditTime,
  BehaviorSubject,
  distinctUntilChanged,
  merge,
  skip,
  Subject,
  Subscription,
  type Observable
} from 'rxjs';

import { SearchExecutionError, type SearchHandle, type SearchResult, type SearchState } from '../types.js';
import { createDebouncedQueryStream } from './debounce.js';
import { createSearchState, type SearchStateMachine } from './search-state.js';

/** 单页查询结果 + 是否还有下一页。 */
export interface SearchPage {
  readonly results: readonly SearchResult[];
  readonly hasMore: boolean;
}

/**
 * 由 plugin.ts 注入的"真正干活"函数：给定查询词与页号，返回该页结果。
 *
 * 页号从 0 开始；空查询由 handle 在调用前过滤，此函数不会收到空串。
 */
export type PerformSearch = (query: string, page: number, signal?: AbortSignal) => Promise<SearchPage>;

/** SearchHandle 工厂配置。 */
export interface CreateSearchHandleOptions {
  /** 底层搜索执行 */
  readonly performSearch: PerformSearch;
  /** 在进入 loading 前判定查询是否含有可索引 token；false 直接回到 idle。 */
  readonly isSearchableQuery?: (query: string) => boolean;
  /** 外部查询词流；错误进入 {@link SearchHandle.error$}，完成后句柄仍可命令式使用。 */
  readonly querySource?: Observable<string>;
  /** 防抖（ms），默认 300；0 → 直通 */
  readonly debounceMs?: number;
  /** 初始查询；触发一次立即 loading */
  readonly initialQuery?: string;
  /**
   * 订阅数据源变更通知（entity 事件）。返回解绑函数。
   *
   * 实现侧应过滤只有插件覆盖范围内的 collection 才回调；本工厂不感知具体 collection。
   */
  readonly subscribeDataChanges?: (onChange: () => void) => () => void;
  /**
   * 数据变更重查的合并窗口（ms），默认 80；`0` → 逐事件直通。
   *
   * @remarks
   * 数据变更走的是绕过 `debounceMs` 的直通通道（这是刻意设计），但**绕过防抖不等于不要节流**：
   * 一次重查会展开成 `collections × fields` 条并发 `rawQuery`，批量导入产生几百个实体事件时
   * 就是数千条 SQL 灌进单线程的 sqlite-wasm worker。窗口内的多次变更合并成一次重查。
   */
  readonly refreshAuditMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_REFRESH_AUDIT_MS = 80;

/**
 * 组装 {@link SearchHandle}。调用方只需关心状态流与生命周期管理。
 *
 * @public
 */
export const createSearchHandle = (opts: CreateSearchHandleOptions): SearchHandle => {
  const sm: SearchStateMachine = createSearchState();
  const query$ = new BehaviorSubject<string>(opts.initialQuery ?? '');
  const trigger$ = new Subject<string>(); // 数据变更触发的直通重查
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const refreshAuditMs = opts.refreshAuditMs ?? DEFAULT_REFRESH_AUDIT_MS;
  const subs = new Subscription();

  let currentQuery = opts.initialQuery ?? '';
  let currentPage = 0;
  let currentResults: SearchResult[] = [];
  // 单调代号：clear/destroy 使在途结果失效，避免异步结算回写已清空或已销毁的状态。
  let generation = 0;
  let activeAbortController: AbortController | undefined;
  let destroyed = false;

  interface PendingQuery {
    readonly query: string;
    readonly page: number;
    readonly waiters: Array<() => void>;
  }

  let pendingQuery: PendingQuery | undefined;
  let pumpRunning = false;

  const runQuery = async (q: string, page: number): Promise<void> => {
    const gen = ++generation;
    currentQuery = q;
    currentPage = page;
    const controller = new AbortController();
    activeAbortController = controller;
    try {
      if (page === 0 && opts.isSearchableQuery && !opts.isSearchableQuery(q)) {
        currentQuery = '';
        currentPage = 0;
        currentResults = [];
        sm.clear();
        return;
      }
      sm.beginQuery(q);
      if (sm.snapshot().state !== 'loading') {
        // 空查询短路；state-machine 已回 idle，清空缓存
        currentQuery = '';
        currentPage = 0;
        currentResults = [];
        return;
      }
      const pageRes = await opts.performSearch(q, page, controller.signal);
      if (gen !== generation) return; // 已被更新查询取代，丢弃陈旧结果
      if (page === 0) {
        currentResults = pageRes.results.length === 0 ? [] : [...pageRes.results];
      } else if (pageRes.results.length > 0) {
        currentResults = currentResults.concat(pageRes.results);
      }
      sm.resolveResults(currentResults, pageRes.hasMore);
    } catch (err) {
      if (gen !== generation) return; // 陈旧失败不覆盖新查询状态
      const wrapped =
        err instanceof SearchExecutionError ? err : new SearchExecutionError('search execution failed', err);
      sm.rejectQuery(wrapped);
    } finally {
      if (activeAbortController === controller) activeAbortController = undefined;
    }
  };

  // 所有查询共享一个执行闸门；执行期间的新请求只覆盖 pending，结算后执行最后一条。
  const pumpQueries = async (): Promise<void> => {
    if (pumpRunning) return;
    pumpRunning = true;
    try {
      while (!destroyed && pendingQuery) {
        const request = pendingQuery;
        pendingQuery = undefined;
        await runQuery(request.query, request.page);
        for (const resolve of request.waiters) resolve();
      }
    } finally {
      pumpRunning = false;
    }
  };

  const enqueueQuery = (q: string, page: number): Promise<void> => {
    if (destroyed) return Promise.resolve();
    return new Promise(resolve => {
      const waiters = pendingQuery?.waiters ?? [];
      pendingQuery = { query: q, page, waiters: [...waiters, resolve] };
      void pumpQueries();
    });
  };

  // 主通道：setQuery → debounce → runQuery(page=0)
  // skip(1) 跳过 BehaviorSubject 的初始 seed：initialQuery 由下方 trigger$ 直通执行一次，
  // 不再经防抖通道重复跑（否则 initialQuery 会被执行两遍）。
  const debounced$ = createDebouncedQueryStream(
    query$.asObservable().pipe(skip(1), distinctUntilChanged()),
    debounceMs
  );
  subs.add(
    merge(
      debounced$,
      // 合并窗口只作用于数据变更通道，不影响用户输入的 debounce 语义
      refreshAuditMs > 0 ? trigger$.pipe(auditTime(refreshAuditMs)) : trigger$
    ).subscribe({
      next: q => {
        void enqueueQuery(q, 0);
      },
      // 兜底，正常路径不可达（覆盖率上表现为常驻未覆盖行）：`runQuery` 自己 try/catch 了
      // 全部执行期异常并走 `sm.rejectQuery`，所以这条流不会因搜索失败而 error。
      // 保留的理由是它守的不是搜索失败，而是**流本身**出错（debounce/merge 算子内部
      // 抛出、或上游 subject 被 error 掉）。删掉就变成 RxJS unhandled error 抛到全局，
      // 状态机停在 loading 且用户永远等不到反馈——同样违反「无 fallback 兜底」的初衷：
      // 这里不是吞掉错误，而是把它导进 state machine 让 UI 能看见。
      error: err => {
        const wrapped =
          err instanceof SearchExecutionError ? err : new SearchExecutionError('search pipeline error', err);
        sm.rejectQuery(wrapped);
      }
    })
  );

  // 数据变更 → 对当前查询直通重查（绕过 debounce）
  if (opts.subscribeDataChanges) {
    subs.add(
      opts.subscribeDataChanges(() => {
        if (currentQuery.trim().length === 0) return;
        trigger$.next(currentQuery);
      })
    );
  }

  // 初始查询：若提供非空 initialQuery，立即触发一次（不等防抖）
  if (opts.initialQuery && opts.initialQuery.trim().length > 0) {
    trigger$.next(opts.initialQuery);
  }

  if (opts.querySource) {
    subs.add(
      opts.querySource.subscribe({
        next: query => query$.next(query),
        error: cause => {
          ++generation;
          const error =
            cause instanceof SearchExecutionError ? cause : new SearchExecutionError('query source error', cause);
          sm.rejectQuery(error);
        }
      })
    );
  }

  const handle: SearchHandle = {
    results$: sm.results$,
    state$: sm.state$ as Observable<SearchState>,
    error$: sm.error$,
    hasMore$: sm.hasMore$,
    setQuery(q: string): void {
      query$.next(q);
    },
    async loadMore(): Promise<void> {
      const snap = sm.snapshot();
      if (snap.state !== 'success' || !snap.hasMore) return;
      await enqueueQuery(currentQuery, currentPage + 1);
    },
    clear(): void {
      ++generation;
      activeAbortController?.abort();
      pendingQuery = undefined;
      query$.next('');
      currentResults = [];
      currentPage = 0;
      currentQuery = '';
      sm.clear();
    },
    retry(): void {
      const snap = sm.snapshot();
      if (snap.state !== 'error') return;
      sm.retry();
      void enqueueQuery(currentQuery, 0);
    },
    destroy(): void {
      destroyed = true;
      ++generation;
      activeAbortController?.abort();
      pendingQuery = undefined;
      subs.unsubscribe();
      query$.complete();
      trigger$.complete();
      sm.destroy();
    }
  };

  return handle;
};

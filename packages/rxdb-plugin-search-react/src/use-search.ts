'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Subscription } from 'rxjs';

import type {
  SearchExecutionError,
  SearchHandle,
  SearchOptions,
  SearchResult,
  SearchSourceLike,
  SearchState
} from '@aiao/rxdb-plugin-search';

/**
 * React 集成 - rxdb-plugin-search
 *
 * 提供 `useSearch()`，将 `SearchHandle` 的 Observable 适配为 React state；
 * 通过同构 layout effect 的清理函数在组件卸载时自动释放 handle。
 *
 * @packageDocumentation
 */

export type { SearchSourceLike };

/**
 * {@link useSearch} 返回值。
 *
 * @public
 */
export interface UseSearchReturn {
  /** 当前查询词 */
  query: string;
  /** 写入查询词；触发插件防抖 */
  setQuery: (q: string) => void;
  /** 当前结果 */
  results: readonly SearchResult[];
  /** 当前状态 */
  state: SearchState;
  /** 最近一次执行错误 */
  error: SearchExecutionError | undefined;
  /** 是否还有下一页 */
  hasMore: boolean;
  /** 加载下一页；无更多时 no-op */
  loadMore: () => Promise<void>;
  /** 清空查询与结果并回到 idle */
  clear: () => void;
  /** 在 error 状态下重试 */
  retry: () => void;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function useStableSearchOptions(options: SearchOptions | undefined): SearchOptions | undefined {
  const collectionsKey = options?.collections === undefined ? undefined : JSON.stringify(options.collections);
  return useMemo(() => {
    if (options === undefined) return undefined;
    const snapshot: SearchOptions = {};
    if (options.debounce !== undefined) snapshot.debounce = options.debounce;
    if (options.pageSize !== undefined) snapshot.pageSize = options.pageSize;
    if (options.snippetLength !== undefined) snapshot.snippetLength = options.snippetLength;
    if (options.collections !== undefined) snapshot.collections = [...options.collections];
    if (options.initialQuery !== undefined) snapshot.initialQuery = options.initialQuery;
    return snapshot;
  }, [options?.debounce, options?.pageSize, options?.snippetLength, collectionsKey]);
}

/**
 * 将 `SearchHandle` 的响应式输出适配为 React hook。
 *
 * @example
 * ```tsx
 * const { query, setQuery, results, state } = useSearch(db, { debounce: 200 });
 * return <input value={query} onChange={e => setQuery(e.target.value)} />;
 * ```
 *
 * @param source - 暴露 `search()` 方法的数据源（`RxDB` / `RxCollection`）
 * @param options - 单次调用级 {@link SearchOptions}
 * @public
 */
export function useSearch(source: SearchSourceLike, options?: SearchOptions): UseSearchReturn {
  const stableOptions = useStableSearchOptions(options);
  const initial = stableOptions?.initialQuery ?? '';

  const handleRef = useRef<SearchHandle | null>(null);
  const [query, setQueryState] = useState<string>(initial);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [error, setError] = useState<SearchExecutionError | undefined>(undefined);
  const [hasMore, setHasMore] = useState<boolean>(false);

  /**
   * 当前 query 的「最新值」镜像，供重建时播种新 handle。
   *
   * @remarks
   * SRCHR-001：早先重建时无条件 `setQueryState(initial)`，`initial` 只来自
   * `options.initialQuery` —— 于是「切换搜索范围」这种与输入框无关的操作
   * 会把用户打了一半的词清空。契约改为**重建保留当前 query**。
   *
   * 用 ref 而不是把 `query` 加进 effect 依赖：后者会让每次击键都重建 handle，
   * 防抖与分页全废。写入点只有 `setQuery` / `clear` 两个回调（非渲染期），
   * layout effect 负责在消费者同阶段 effect 前完成句柄绑定，避免首个 commit 的命令窗口。
   */
  const queryRef = useRef<string>(initial);

  useIsomorphicLayoutEffect(() => {
    // handle 是命令式控制器，不参与渲染，存入 ref 而非 state：
    // 避免 handle 变化触发多余的重渲染，并让 setQuery/clear/retry/loadMore
    // 始终读取最新 handle，不会在 rebuild 后仍调用到已销毁的旧实例。
    const seed = queryRef.current;
    const newHandle = source.search(seed, stableOptions);
    handleRef.current = newHandle;

    const subs = new Subscription();
    subs.add(newHandle.results$.subscribe(r => setResults(r)));
    subs.add(newHandle.state$.subscribe(s => setState(s)));
    subs.add(newHandle.error$.subscribe(e => setError(e)));
    subs.add(newHandle.hasMore$.subscribe(h => setHasMore(h)));
    return () => {
      subs.unsubscribe();
      newHandle.destroy();
      if (handleRef.current === newHandle) handleRef.current = null;
    };
  }, [source, stableOptions]);

  const setQuery = useCallback((q: string) => {
    queryRef.current = q;
    setQueryState(q);
    handleRef.current?.setQuery(q);
  }, []);

  const clear = useCallback(() => {
    queryRef.current = '';
    setQueryState('');
    handleRef.current?.clear();
  }, []);

  const retry = useCallback(() => handleRef.current?.retry(), []);
  const loadMore = useCallback(() => handleRef.current?.loadMore() ?? Promise.resolve(), []);

  return useMemo(
    () => ({ query, setQuery, results, state, error, hasMore, loadMore, clear, retry }),
    [query, setQuery, results, state, error, hasMore, loadMore, clear, retry]
  );
}

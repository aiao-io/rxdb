import { act, configure, render, renderHook } from '@testing-library/react';
import { StrictMode, createElement, useLayoutEffect, type PropsWithChildren } from 'react';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SearchExecutionError,
  type SearchExecutionError as SearchExecutionErrorType,
  type SearchHandle,
  type SearchResult,
  type SearchState
} from '@aiao/rxdb-plugin-search';

import { useSearch, type SearchSourceLike } from '../use-search.js';

const makeHandle = () => {
  const results$ = new BehaviorSubject<SearchResult[]>([]);
  const state$ = new BehaviorSubject<SearchState>('idle');
  const error$ = new BehaviorSubject<SearchExecutionErrorType | undefined>(undefined);
  const hasMore$ = new BehaviorSubject<boolean>(false);
  const destroyed = { value: false };
  const setQuery = vi.fn();
  const loadMore = vi.fn(async () => {
    /* 无操作 */
  });
  const clear = vi.fn();
  const retry = vi.fn();

  const handle: SearchHandle = {
    results$,
    state$,
    error$,
    hasMore$,
    setQuery,
    loadMore,
    clear,
    retry,
    destroy: vi.fn(() => {
      destroyed.value = true;
    })
  };
  return { handle, results$, state$, error$, hasMore$, setQuery, loadMore, clear, retry, destroyed };
};

const makeSource = (handle: SearchHandle): SearchSourceLike & { searchSpy: ReturnType<typeof vi.fn> } => {
  const searchSpy = vi.fn(() => handle);
  return {
    search: searchSpy,
    searchSpy
  };
};

afterEach(() => {
  vi.useRealTimers();
  configure({ reactStrictMode: false });
});

describe('useSearch (React binding, T039)', () => {
  it('initial render mirrors handle observables', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result } = renderHook(() => useSearch(src));
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.state).toBe('idle');
    expect(result.current.hasMore).toBe(false);
    expect(src.searchSpy).toHaveBeenCalledTimes(1);
  });

  it('setQuery forwards to handle.setQuery and updates local query state', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result } = renderHook(() => useSearch(src));
    act(() => result.current.setQuery('foo'));
    expect(h.setQuery).toHaveBeenCalledWith('foo');
    expect(result.current.query).toBe('foo');
  });

  it('handle observable updates propagate to hook state', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result } = renderHook(() => useSearch(src));
    const rows: SearchResult[] = [{ entity: 'A', collection: 'a', id: '1', rank: -1, matchedField: 'x', snippet: 's' }];
    act(() => {
      h.results$.next(rows);
      h.state$.next('success');
      h.hasMore$.next(true);
    });
    expect(result.current.results).toEqual(rows);
    expect(result.current.state).toBe('success');
    expect(result.current.hasMore).toBe(true);
  });

  it('forwards commands issued by the consumer layout effect on the first commit', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const Probe = (): null => {
      const { setQuery } = useSearch(src);
      useLayoutEffect(() => {
        setQuery('layout-query');
      }, [setQuery]);
      return null;
    };

    render(createElement(Probe));

    expect(h.setQuery).toHaveBeenCalledWith('layout-query');
  });

  it('unmount calls handle.destroy', () => {
    vi.useFakeTimers();
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { unmount } = renderHook(() => useSearch(src));
    unmount();
    vi.runAllTimers();
    expect(h.destroyed.value).toBe(true);
  });

  it('keeps the latest handle usable under React StrictMode double effects', () => {
    vi.useFakeTimers();
    configure({ reactStrictMode: true });
    const first = makeHandle();
    const second = makeHandle();
    const searchSpy = vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const src: SearchSourceLike = { search: searchSpy };
    const StrictWrapper = ({ children }: PropsWithChildren) => createElement(StrictMode, null, children);

    const { result, unmount } = renderHook(() => useSearch(src), { wrapper: StrictWrapper });

    act(() => {
      vi.runAllTimers();
    });
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(first.destroyed.value).toBe(true);
    expect(second.destroyed.value).toBe(false);

    act(() => result.current.setQuery('foo'));
    expect(second.setQuery).toHaveBeenCalledWith('foo');
    expect(result.current.query).toBe('foo');

    unmount();
    act(() => {
      vi.runAllTimers();
    });
    expect(second.destroyed.value).toBe(true);
  });

  it('publishes errors and clears them after the source recovers', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result } = renderHook(() => useSearch(src));
    const error = new SearchExecutionError('search failed');

    act(() => h.error$.next(error));
    expect(result.current.error).toBe(error);

    act(() => h.error$.next(undefined));
    expect(result.current.error).toBeUndefined();
  });

  it('clear() resets query to empty and calls handle.clear', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result } = renderHook(() => useSearch(src));
    act(() => result.current.setQuery('foo'));
    act(() => result.current.clear());
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(result.current.query).toBe('');
  });

  it('retry() and loadMore() forward to handle', async () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result } = renderHook(() => useSearch(src));
    act(() => result.current.retry());
    await act(async () => {
      await result.current.loadMore();
    });
    expect(h.retry).toHaveBeenCalledTimes(1);
    expect(h.loadMore).toHaveBeenCalledTimes(1);
  });

  it('passes initialQuery to source.search', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    renderHook(() => useSearch(src, { initialQuery: 'hi' }));
    expect(src.searchSpy).toHaveBeenCalledWith('hi', { initialQuery: 'hi' });
  });

  it('rebuilds the handle when source changes', () => {
    vi.useFakeTimers();
    const first = makeHandle();
    const second = makeHandle();
    const firstSource = makeSource(first.handle);
    const secondSource = makeSource(second.handle);
    const { result, rerender } = renderHook(({ source }) => useSearch(source), {
      initialProps: { source: firstSource as SearchSourceLike }
    });

    rerender({ source: secondSource });
    act(() => vi.runAllTimers());
    act(() => result.current.setQuery('next'));

    expect(first.destroyed.value).toBe(true);
    expect(first.setQuery).not.toHaveBeenCalled();
    expect(secondSource.searchSpy).toHaveBeenCalledTimes(1);
    expect(second.setQuery).toHaveBeenCalledWith('next');
  });

  it('does not rebuild for a semantically identical inline options object', () => {
    vi.useFakeTimers();
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { rerender } = renderHook(() => useSearch(src, { debounce: 10, collections: ['Todo'] }));

    rerender();
    act(() => vi.runAllTimers());

    expect(src.searchSpy).toHaveBeenCalledTimes(1);
    expect(h.destroyed.value).toBe(false);
  });

  it('passes an options snapshot that cannot be mutated after the commit', () => {
    const h = makeHandle();
    const src = makeSource(h.handle);
    const options = { collections: ['Todo'] };

    renderHook(() => useSearch(src, options));
    options.collections.push('Article');

    expect(src.searchSpy).toHaveBeenCalledWith('', { collections: ['Todo'] });
  });

  /**
   * SRCHR-001 的目标行为（此前是一条 ⛔️ 锁定缺陷的用例，已翻转）。
   *
   * 契约：**重建 handle 时保留用户当前 query，并以它播种新 handle。**
   * 切换搜索范围是与输入框无关的操作，不该把用户打了一半的词清掉。
   * 三个 demo 页（React/Angular/Vue）独立手写的都是这个行为，三端同一答案。
   * 见 SRA-008 / SRCHV-004 / APP-dev-rxdb-react-p0-2。
   */
  it('切换 collections 保留用户当前 query，并以它播种新 handle', () => {
    vi.useFakeTimers();
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result, rerender } = renderHook(({ collections }) => useSearch(src, { collections }), {
      initialProps: { collections: ['Todo'] as readonly string[] }
    });

    act(() => result.current.setQuery('用户打到一半的词'));
    expect(result.current.query).toBe('用户打到一半的词');

    // 仅切换 scope，完全没碰输入框
    rerender({ collections: ['Article'] });
    act(() => vi.runAllTimers());

    expect(src.searchSpy).toHaveBeenCalledTimes(2);
    expect(src.searchSpy.mock.calls[1]?.[0]).toBe('用户打到一半的词');
    expect(result.current.query).toBe('用户打到一半的词');
  });

  it('source 变化时同样以当前 query 播种新 handle', () => {
    vi.useFakeTimers();
    const first = makeHandle();
    const second = makeHandle();
    const firstSource = makeSource(first.handle);
    const secondSource = makeSource(second.handle);
    const { result, rerender } = renderHook(({ source }) => useSearch(source), {
      initialProps: { source: firstSource as SearchSourceLike }
    });

    act(() => result.current.setQuery('保留我'));
    rerender({ source: secondSource });
    act(() => vi.runAllTimers());

    expect(secondSource.searchSpy).toHaveBeenCalledWith('保留我', undefined);
    expect(result.current.query).toBe('保留我');
  });

  /**
   * 这条锁的是 `searchOptionsEqual` 把 `initialQuery` 排除在外。
   *
   * 契约定成「重建保留当前 query」之后，`initialQuery` 只在首次创建时作种子；
   * 若它仍参与重建判据，调用方传 `initialQuery: query` 就会**每敲一个键重建一次 handle**。
   * 这正是 SRCHR-001 记的「两条路都不通」里的第二条。
   */
  it('只有 initialQuery 变化时不重建 handle', () => {
    vi.useFakeTimers();
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { rerender } = renderHook(({ q }) => useSearch(src, { collections: ['Todo'], initialQuery: q }), {
      initialProps: { q: '' }
    });

    rerender({ q: '用' });
    rerender({ q: '用户' });
    rerender({ q: '用户打' });
    act(() => vi.runAllTimers());

    expect(src.searchSpy).toHaveBeenCalledTimes(1);
    expect(h.destroyed.value).toBe(false);
  });

  it('routes calls to the latest handle even via a callback captured before rebuild', () => {
    vi.useFakeTimers();
    const first = makeHandle();
    const second = makeHandle();
    const firstSource = makeSource(first.handle);
    const secondSource = makeSource(second.handle);
    const { result, rerender } = renderHook(({ source }) => useSearch(source), {
      initialProps: { source: firstSource as SearchSourceLike }
    });
    const staleSetQuery = result.current.setQuery;

    rerender({ source: secondSource });
    act(() => vi.runAllTimers());

    act(() => staleSetQuery('after-rebuild'));

    expect(second.setQuery).toHaveBeenCalledWith('after-rebuild');
    expect(first.setQuery).not.toHaveBeenCalled();
  });

  it('keeps stable setQuery/clear/retry/loadMore identities across handle rebuilds', () => {
    vi.useFakeTimers();
    const first = makeHandle();
    const second = makeHandle();
    const firstSource = makeSource(first.handle);
    const secondSource = makeSource(second.handle);
    const { result, rerender } = renderHook(({ source }) => useSearch(source), {
      initialProps: { source: firstSource as SearchSourceLike }
    });
    const { setQuery, clear, retry, loadMore } = result.current;

    rerender({ source: secondSource });
    act(() => vi.runAllTimers());

    expect(result.current.setQuery).toBe(setQuery);
    expect(result.current.clear).toBe(clear);
    expect(result.current.retry).toBe(retry);
    expect(result.current.loadMore).toBe(loadMore);
  });

  it('rebuilds when search options change and treats collection order as significant', () => {
    vi.useFakeTimers();
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { rerender } = renderHook(({ options }) => useSearch(src, options), {
      initialProps: { options: { debounce: 10, collections: ['Todo'] } }
    });

    rerender({ options: { debounce: 20, collections: ['Todo'] } });
    act(() => vi.runAllTimers());
    expect(src.searchSpy).toHaveBeenCalledTimes(2);

    rerender({ options: { debounce: 20, collections: ['Note'] } });
    act(() => vi.runAllTimers());
    expect(src.searchSpy).toHaveBeenCalledTimes(3);

    rerender({ options: { debounce: 20, collections: ['Note', 'Todo'] } });
    act(() => vi.runAllTimers());
    expect(src.searchSpy).toHaveBeenCalledTimes(4);

    // 语义相同的 options 对象仅引用变化时不应重建。
    rerender({ options: { debounce: 20, collections: ['Note', 'Todo'] } });
    act(() => vi.runAllTimers());
    expect(src.searchSpy).toHaveBeenCalledTimes(4);
  });

  it('rebuilds when options appear or disappear and no-ops commands after destroy', async () => {
    vi.useFakeTimers();
    const h = makeHandle();
    const src = makeSource(h.handle);
    const { result, rerender, unmount } = renderHook(
      ({ options }: { options?: { debounce: number } }) => useSearch(src, options),
      { initialProps: { options: undefined as { debounce: number } | undefined } }
    );

    rerender({ options: { debounce: 15 } });
    act(() => vi.runAllTimers());
    expect(src.searchSpy).toHaveBeenCalledTimes(2);

    rerender({ options: undefined });
    act(() => vi.runAllTimers());
    expect(src.searchSpy).toHaveBeenCalledTimes(3);

    unmount();
    act(() => vi.runAllTimers());

    await act(async () => {
      await expect(result.current.loadMore()).resolves.toBeUndefined();
    });
    act(() => {
      result.current.setQuery('after-unmount');
      result.current.clear();
      result.current.retry();
    });
  });
});

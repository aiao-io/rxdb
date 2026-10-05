import { RxDB, SyncType } from '@aiao/rxdb';
import {
  createSearchHandle,
  rxDBPluginSearch,
  searchOptionsEqual,
  type PerformSearch,
  type SearchPage
} from '@aiao/rxdb-plugin-search';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { Component, createElement, type PropsWithChildren } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SearchExecutionError,
  useSearch,
  type SearchHandle,
  type SearchOptions,
  type SearchSourceLike
} from '../index.js';

function deferred<T>() {
  return Promise.withResolvers<T>();
}

interface PendingSearch {
  readonly query: string;
  readonly page: number;
  readonly signal: AbortSignal | undefined;
  readonly gate: ReturnType<typeof deferred<SearchPage>>;
}

function controlledSource() {
  const requests: PendingSearch[] = [];
  const handles: SearchHandle[] = [];
  const performSearch = vi.fn<PerformSearch>((query, page, signal) => {
    const gate = deferred<SearchPage>();
    requests.push({ query, page, signal, gate });
    return gate.promise;
  });
  const search = vi.fn((initialQuery: string, options?: SearchOptions): SearchHandle => {
    const core = createSearchHandle({
      performSearch,
      initialQuery,
      refreshAuditMs: 0,
      debounceMs: options?.debounce ?? 0
    });
    const handle: SearchHandle = { ...core, destroy: vi.fn(() => core.destroy()) };
    handles.push(handle);
    return handle;
  });
  const source: SearchSourceLike = { search };
  return { source, search, requests, handles };
}

function pendingAt(requests: readonly PendingSearch[], index: number): PendingSearch {
  const request = requests[index];
  if (!request) throw new Error(`缺少第 ${index} 个实际搜索请求`);
  return request;
}

function page(id: string, hasMore = false): SearchPage {
  return {
    results: [{ entity: 'Article', collection: 'article', id, rank: -1, matchedField: 'title', snippet: id }],
    hasMore
  };
}

class SearchBoundary extends Component<PropsWithChildren, { error: Error | undefined }> {
  override state: { error: Error | undefined } = { error: undefined };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override render() {
    return this.state.error ? createElement('p', { role: 'alert' }, this.state.error.message) : this.props.children;
  }
}

function BindingProbe({ source }: { source: SearchSourceLike }) {
  const search = useSearch(source);
  return createElement('p', null, search.state);
}

function database(name: string): RxDB {
  return new RxDB({
    dbName: name,
    entities: [],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('第二轮评审：真实 SearchHandle 与 React 生命周期', () => {
  it('快速 A→B 由 core 防抖，只执行 B 且不重建 handle', async () => {
    vi.useFakeTimers();
    const control = controlledSource();
    const { result } = renderHook(() => useSearch(control.source, { debounce: 50 }));
    act(() => {
      result.current.setQuery('A');
      result.current.setQuery('B');
    });
    await act(async () => vi.advanceTimersByTimeAsync(49));
    expect(control.requests).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(control.requests.map(request => request.query)).toEqual(['B']);
    expect(result.current).toMatchObject({ query: 'B', state: 'loading', error: undefined });
    await act(async () => pendingAt(control.requests, 0).gate.resolve(page('B')));
    expect(result.current.results.map(row => row.id)).toEqual(['B']);
    expect(result.current.state).toBe('success');
    expect(control.search).toHaveBeenCalledTimes(1);
  });

  it('已执行 A 后输入 B，串行闸门最终只留下 B 的第一页结果', async () => {
    const control = controlledSource();
    const { result } = renderHook(() => useSearch(control.source));
    act(() => result.current.setQuery('A'));
    act(() => result.current.setQuery('B'));
    expect(control.requests.map(request => request.query)).toEqual(['A']);
    await act(async () => pendingAt(control.requests, 0).gate.resolve(page('A', true)));
    expect(control.requests.map(request => request.query)).toEqual(['A', 'B']);
    expect(result.current.query).toBe('B');
    await act(async () => pendingAt(control.requests, 1).gate.resolve(page('B')));
    expect(result.current.results.map(row => row.id)).toEqual(['B']);
    expect(result.current).toMatchObject({ state: 'success', error: undefined, hasMore: false });
  });

  it.each(['result', 'error'] as const)('换 source 与 scope 后，旧请求晚到 %s 不回流', async outcome => {
    const first = controlledSource();
    const second = controlledSource();
    const { result, rerender } = renderHook(
      ({ source, options }: { source: SearchSourceLike; options: SearchOptions }) => useSearch(source, options),
      { initialProps: { source: first.source, options: { collections: ['Article'], pageSize: 2 } } }
    );
    act(() => result.current.setQuery('保留当前词'));
    const oldRequest = pendingAt(first.requests, 0);
    const commands = result.current;
    rerender({ source: second.source, options: { collections: ['Note'], pageSize: 3 } });
    expect(oldRequest.signal?.aborted).toBe(true);
    expect(first.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(second.search).toHaveBeenCalledWith('保留当前词', { collections: ['Note'], pageSize: 3 });
    expect(result.current.setQuery).toBe(commands.setQuery);
    expect(result.current.clear).toBe(commands.clear);
    expect(result.current.retry).toBe(commands.retry);
    expect(result.current.loadMore).toBe(commands.loadMore);
    await act(async () => pendingAt(second.requests, 0).gate.resolve(page('new')));
    await act(async () => {
      if (outcome === 'result') oldRequest.gate.resolve(page('obsolete'));
      else oldRequest.gate.reject(new SearchExecutionError('旧库错误'));
    });
    expect(result.current.results.map(row => row.id)).toEqual(['new']);
    expect(result.current).toMatchObject({ query: '保留当前词', state: 'success', error: undefined, hasMore: false });
    act(commands.clear);
    expect(result.current).toMatchObject({ query: '', state: 'idle', results: [], error: undefined, hasMore: false });
  });

  it('相同值新 options 保持返回值，pageSize 与 snippetLength 变化才重建', () => {
    const control = controlledSource();
    const initialProps: { options: SearchOptions } = {
      options: { debounce: 0, pageSize: 2, snippetLength: 20, collections: ['Article'] }
    };
    const { result, rerender } = renderHook(
      ({ options }: { options: SearchOptions }) => useSearch(control.source, options),
      { initialProps }
    );
    const before = result.current;
    rerender({
      options: { debounce: 0, pageSize: 2, snippetLength: 20, collections: ['Article'], initialQuery: 'ignored' }
    });
    expect(control.search).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(before);
    rerender({ options: { debounce: 0, pageSize: 3, snippetLength: 20, collections: ['Article'] } });
    expect(control.search).toHaveBeenCalledTimes(2);
    rerender({ options: { debounce: 0, pageSize: 3, snippetLength: 30, collections: ['Article'] } });
    expect(control.search).toHaveBeenCalledTimes(3);
  });

  it('undefined↔空 options 按公开 core 比较判据重建，而非复用旧 snapshot', () => {
    const control = controlledSource();
    const initialProps: { options: SearchOptions | undefined } = { options: undefined };
    const { rerender } = renderHook(
      ({ options }: { options: SearchOptions | undefined }) => useSearch(control.source, options),
      { initialProps }
    );
    expect(searchOptionsEqual(undefined, {})).toBe(false);
    rerender({ options: {} });
    expect(control.search).toHaveBeenCalledTimes(2);
    expect(control.search).toHaveBeenLastCalledWith('', {});
    rerender({ options: undefined });
    expect(control.search).toHaveBeenCalledTimes(3);
  });

  it('并发 loadMore 不重入执行闸门、不重复追加页', async () => {
    const control = controlledSource();
    const { result } = renderHook(() => useSearch(control.source));
    act(() => result.current.setQuery('pages'));
    await act(async () => pendingAt(control.requests, 0).gate.resolve(page('0', true)));
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    act(() => {
      first = result.current.loadMore();
      second = result.current.loadMore();
    });
    expect(control.requests.map(request => request.page)).toEqual([0, 1]);
    await act(async () => {
      pendingAt(control.requests, 1).gate.resolve(page('1'));
      await Promise.all([first, second]);
    });
    expect(result.current.results.map(row => row.id)).toEqual(['0', '1']);
    expect(result.current.hasMore).toBe(false);
  });

  it.each(['clear', 'unmount'] as const)('已执行分页在 %s 后被取消，晚到结果不改状态且调用可结算', async action => {
    const control = controlledSource();
    const { result, unmount } = renderHook(() => useSearch(control.source));
    act(() => result.current.setQuery('pages'));
    await act(async () => pendingAt(control.requests, 0).gate.resolve(page('0', true)));
    let loading: Promise<void> | undefined;
    act(() => {
      loading = result.current.loadMore();
    });
    const request = pendingAt(control.requests, 1);
    const snapshot = result.current;
    if (action === 'clear') act(result.current.clear);
    else unmount();
    expect(request.signal?.aborted).toBe(true);
    await act(async () => {
      request.gate.resolve(page('obsolete'));
      await loading;
    });
    if (action === 'clear') {
      expect(result.current).toMatchObject({ query: '', state: 'idle', results: [], error: undefined, hasMore: false });
      return;
    }
    expect(result.current).toBe(snapshot);
    expect(control.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    await expect(snapshot.loadMore()).resolves.toBeUndefined();
  });

  it('两个独立 StrictMode root 的重放、卸载与晚到结果各归其主', async () => {
    const first = controlledSource();
    const second = controlledSource();
    const left = renderHook(() => useSearch(first.source), { reactStrictMode: true });
    const right = renderHook(() => useSearch(second.source), { reactStrictMode: true });
    expect(first.handles).toHaveLength(2);
    expect(second.handles).toHaveLength(2);
    expect(first.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(second.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    act(() => left.result.current.setQuery('left'));
    act(() => right.result.current.setQuery('right'));
    const leftSnapshot = left.result.current;
    left.unmount();
    expect(pendingAt(first.requests, 0).signal?.aborted).toBe(true);
    expect(pendingAt(second.requests, 0).signal?.aborted).toBe(false);
    await act(async () => {
      pendingAt(first.requests, 0).gate.resolve(page('dead-root'));
      pendingAt(second.requests, 0).gate.resolve(page('live-root'));
    });
    expect(left.result.current).toBe(leftSnapshot);
    expect(right.result.current.results.map(row => row.id)).toEqual(['live-root']);
    expect(right.result.current.query).toBe('right');
    expect(second.handles[1]?.destroy).not.toHaveBeenCalled();
    right.unmount();
    expect(first.handles[1]?.destroy).toHaveBeenCalledTimes(1);
    expect(second.handles[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('SSR render 不调用 search，initialQuery 仅成为初始快照', () => {
    const control = controlledSource();
    function ServerProbe() {
      const search = useSearch(control.source, { initialQuery: 'server-seed' });
      return createElement('p', null, `${search.query}:${search.state}`);
    }
    expect(renderToString(createElement(ServerProbe))).toContain('server-seed:idle');
    expect(control.search).not.toHaveBeenCalled();
  });

  it.each(['missing-plugin', 'not-installed'] as const)('真实 RxDB 的 %s 不伪装 empty，交给异常边界', async mode => {
    const db = database(`review-round2-search-${mode}`);
    if (mode === 'not-installed') db.use(rxDBPluginSearch);
    const caught = vi.fn();
    try {
      render(createElement(SearchBoundary, null, createElement(BindingProbe, { source: db })), {
        onCaughtError: caught
      });
      expect(screen.getByRole('alert').textContent).toMatch(
        mode === 'missing-plugin' ? /search.*not a function/ : /not installed/
      );
      expect(caught).toHaveBeenCalled();
    } finally {
      cleanup();
      await db.destroy();
    }
  });
});

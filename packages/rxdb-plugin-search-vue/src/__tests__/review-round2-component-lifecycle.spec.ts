import { RxDB, SyncType } from '@aiao/rxdb';
import {
  createSearchHandle,
  RxDBPluginSearch,
  SearchExecutionError,
  SearchUnsupportedAdapterError,
  type SearchHandle,
  type SearchPage,
  type SearchResult
} from '@aiao/rxdb-plugin-search';
import { mount } from '@vue/test-utils';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, effectScope, h, nextTick, readonly, ref, shallowRef } from 'vue';

import {
  useSearch,
  type SearchOptions,
  type SearchSourceLike,
  type SearchState,
  type UseSearchReturn
} from '../index.js';

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
});

interface Request {
  query: string;
  page: number;
  signal: AbortSignal | undefined;
  resolve: (value: SearchPage) => void;
  reject: (reason: unknown) => void;
}

function row(id: string): SearchResult {
  return { entity: 'Article', collection: 'article', id, rank: -1, matchedField: 'title', snippet: id };
}

function controlledSource() {
  const requests: Request[] = [];
  const handles: SearchHandle[] = [];
  const search = vi.fn((initialQuery: string, options?: SearchOptions): SearchHandle => {
    const handle = createSearchHandle({
      initialQuery,
      refreshAuditMs: 0,
      debounceMs: options?.debounce ?? 0,
      performSearch: (query, page, signal) => {
        const deferred = Promise.withResolvers<SearchPage>();
        requests.push({ query, page, signal, resolve: deferred.resolve, reject: deferred.reject });
        return deferred.promise;
      }
    });
    handles.push(handle);
    vi.spyOn(handle, 'destroy');
    return handle;
  });
  const source: SearchSourceLike = { search };
  const request = (index: number): Request => {
    const value = requests[index];
    if (!value) throw new Error(`缺少第 ${index} 个请求`);
    return value;
  };
  return { source, search, handles, requests, request };
}

function mountSearch(factory: () => UseSearchReturn) {
  let binding: UseSearchReturn | undefined;
  const Component = defineComponent({
    setup() {
      const search = factory();
      binding = search;
      return () =>
        h(
          'output',
          `${search.query.value}:${search.state.value}:${search.results.value.map(value => value.id).join(',')}`
        );
    }
  });
  const wrapper = mount(Component);
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    wrapper.unmount();
  };
  disposers.push(unmount);
  if (!binding) throw new Error('组件 setup 未建立 search');
  return { binding, wrapper, unmount };
}

describe('第二轮收尾：Vue 真实组件与搜索所有权', () => {
  it('多实例独立；卸载会取消在途请求，迟到失败不写回，后续命令不启动 I/O', async () => {
    const fixture = controlledSource();
    const first = mountSearch(() => useSearch(fixture.source));
    const second = mountSearch(() => useSearch(fixture.source));
    expect(fixture.handles).toHaveLength(2);
    first.binding.query.value = 'first';
    second.binding.query.value = 'second';
    await nextTick();
    await vi.waitFor(() => expect(fixture.requests).toHaveLength(2));
    const firstRequest = fixture.request(0);
    const secondRequest = fixture.request(1);
    expect([firstRequest.query, secondRequest.query]).toEqual(['first', 'second']);
    const before = {
      state: first.binding.state.value,
      results: first.binding.results.value,
      error: first.binding.error.value,
      hasMore: first.binding.hasMore.value
    };
    first.unmount();
    expect(firstRequest.signal?.aborted).toBe(true);
    expect(fixture.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(secondRequest.signal?.aborted).toBe(false);
    firstRequest.reject(new SearchExecutionError('已卸载组件的迟到错误'));
    secondRequest.resolve({ results: [row('second-row')], hasMore: false });
    await vi.waitFor(() => expect(second.binding.state.value).toBe('success'));
    expect(first.binding.state.value).toBe(before.state);
    expect(first.binding.results.value).toBe(before.results);
    expect(first.binding.error.value).toBe(before.error);
    expect(first.binding.hasMore.value).toBe(before.hasMore);
    expect(second.wrapper.text()).toContain('second:success:second-row');
    await expect(first.binding.loadMore()).resolves.toBeUndefined();
    first.binding.retry();
    first.binding.clear();
    first.binding.query.value = 'after-unmount';
    await nextTick();
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.search).toHaveBeenCalledTimes(2);
    second.unmount();
    expect(fixture.handles[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('computed 来源切换与深 options 更改释放旧分页，保留 query 并隔离迟到结果', async () => {
    const first = controlledSource();
    const second = controlledSource();
    const source = shallowRef<SearchSourceLike>(first.source);
    const options = ref<SearchOptions>({ initialQuery: 'kept', pageSize: 1, collections: ['article'] });
    const component = mountSearch(() =>
      useSearch(
        computed(() => source.value),
        readonly(options)
      )
    );
    await vi.waitFor(() => expect(first.requests).toHaveLength(1));
    first.request(0).resolve({ results: [row('old-page-0')], hasMore: true });
    await vi.waitFor(() => expect(component.binding.state.value).toBe('success'));
    const pagination = component.binding.loadMore();
    await vi.waitFor(() => expect(first.requests).toHaveLength(2));
    const oldPage = first.request(1);
    expect(oldPage.page).toBe(1);
    source.value = second.source;
    options.value.collections = ['article', 'notes'];
    options.value.pageSize = 2;
    await nextTick();
    expect(oldPage.signal?.aborted).toBe(true);
    expect(first.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(second.search).toHaveBeenCalledTimes(1);
    expect(second.search).toHaveBeenCalledWith('kept', {
      initialQuery: 'kept',
      pageSize: 2,
      collections: ['article', 'notes']
    });
    oldPage.resolve({ results: [row('stale-page-1')], hasMore: false });
    await pagination;
    expect(component.binding.query.value).toBe('kept');
    expect(component.binding.results.value).toEqual([]);
    expect(component.binding.state.value).toBe('loading');
    second.request(0).resolve({ results: [row('new-page-0')], hasMore: false });
    await vi.waitFor(() => expect(component.binding.state.value).toBe('success'));
    expect(component.binding.results.value.map(result => result.id)).toEqual(['new-page-0']);
    expect(component.wrapper.text()).not.toContain('stale');
  });

  it('真实 handle 的快速 A→B 队列最终只保留 B；clear 取消在途请求并隔离迟到失败', async () => {
    const fixture = controlledSource();
    const component = mountSearch(() => useSearch(fixture.source));
    component.binding.query.value = 'A';
    await nextTick();
    await vi.waitFor(() => expect(fixture.requests).toHaveLength(1));
    component.binding.query.value = 'B';
    await nextTick();
    expect(fixture.requests).toHaveLength(1);
    fixture.request(0).resolve({ results: [row('A-row')], hasMore: true });
    await vi.waitFor(() => expect(fixture.requests).toHaveLength(2));
    expect(fixture.request(1).query).toBe('B');
    fixture.request(1).resolve({ results: [row('B-row')], hasMore: true });
    await vi.waitFor(() => expect(component.binding.state.value).toBe('success'));
    expect(component.binding.results.value.map(result => result.id)).toEqual(['B-row']);
    const handle = fixture.handles[0];
    if (!handle) throw new Error('缺少活动 handle');
    let rawResults: readonly Readonly<SearchResult>[] = [];
    const subscription = handle.results$.subscribe(results => {
      rawResults = results;
    });
    disposers.push(() => subscription.unsubscribe());
    expect(component.binding.results.value).toBe(rawResults);
    expect(component.binding.results.value[0]).toBe(rawResults[0]);
    expect(Object.isFrozen(rawResults[0])).toBe(true);
    component.binding.query.value = 'clear-pending';
    await nextTick();
    await vi.waitFor(() => expect(fixture.requests).toHaveLength(3));
    component.binding.clear();
    await nextTick();
    expect(fixture.request(2).signal?.aborted).toBe(true);
    fixture.request(2).reject(new SearchExecutionError('已取消查询的迟到失败'));
    await Promise.resolve();
    await nextTick();
    expect(component.binding.query.value).toBe('');
    expect(component.binding.results.value).toEqual([]);
    expect(component.binding.state.value).toBe('idle');
    expect(component.binding.error.value).toBeUndefined();
    expect(component.binding.hasMore.value).toBe(false);
    expect(fixture.requests).toHaveLength(3);
  });

  it('卸载释放全部桥接订阅，未完成的旧流不能再写入 ref 或重启 watcher', async () => {
    const results$ = new BehaviorSubject<readonly SearchResult[]>([]);
    const state$ = new BehaviorSubject<SearchState>('idle');
    const error$ = new BehaviorSubject<SearchExecutionError | undefined>(undefined);
    const hasMore$ = new BehaviorSubject(false);
    const handle: SearchHandle = {
      results$,
      state$,
      error$,
      hasMore$,
      setQuery: vi.fn(),
      loadMore: vi.fn(() => Promise.resolve()),
      clear: vi.fn(),
      retry: vi.fn(),
      destroy: vi.fn()
    };
    const source: SearchSourceLike = { search: () => handle };
    const component = mountSearch(() => useSearch(() => source));
    expect([results$.observed, state$.observed, error$.observed, hasMore$.observed]).toEqual([true, true, true, true]);
    component.unmount();
    expect([results$.observed, state$.observed, error$.observed, hasMore$.observed]).toEqual([
      false,
      false,
      false,
      false
    ]);
    results$.next([row('late')]);
    state$.next('error');
    error$.next(new SearchExecutionError('旧流错误'));
    hasMore$.next(true);
    component.binding.query.value = 'late';
    await nextTick();
    expect(component.binding.results.value).toEqual([]);
    expect(component.binding.state.value).toBe('idle');
    expect(component.binding.error.value).toBeUndefined();
    expect(component.binding.hasMore.value).toBe(false);
    expect(handle.setQuery).not.toHaveBeenCalled();
    await component.binding.loadMore();
    component.binding.clear();
    component.binding.retry();
    expect(handle.loadMore).not.toHaveBeenCalled();
    expect(handle.clear).not.toHaveBeenCalled();
    expect(handle.retry).not.toHaveBeenCalled();
    expect(handle.destroy).toHaveBeenCalledTimes(1);
  });

  it('真实 RxDB 缺少插件或插件未连接时显式失败，不返回假空态', async () => {
    const database = new RxDB({
      dbName: 'review-round2-search-vue-prerequisite',
      entities: [],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'sqlite-wasm' } }
    });
    const scope = effectScope();
    try {
      expect(database.search).toBeUndefined();
      expect(() => scope.run(() => useSearch(database))).toThrow(TypeError);
      const plugin = new RxDBPluginSearch(database);
      expect(() => scope.run(() => useSearch(plugin))).toThrow(/not installed/);
    } finally {
      scope.stop();
      await database.disconnectAll();
    }
  });

  it('真实插件在不支持的 backend 上创建失败，早于组件 setup 与假句柄', async () => {
    const database = new RxDB({
      dbName: 'review-round2-search-vue-unsupported',
      entities: [],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'http' } }
    });
    try {
      expect(() => new RxDBPluginSearch(database)).toThrow(SearchUnsupportedAdapterError);
      expect(database.search).toBeUndefined();
    } finally {
      await database.disconnectAll();
    }
  });
});

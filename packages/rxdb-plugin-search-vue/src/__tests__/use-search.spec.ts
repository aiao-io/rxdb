import { renderToString } from '@vue/test-utils';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick, shallowRef } from 'vue';

import type { SearchExecutionError, SearchHandle, SearchResult, SearchState } from '@aiao/rxdb-plugin-search';

import { useSearch, type SearchSourceLike } from '../use-search.js';

const makeHandle = () => {
  const results$ = new BehaviorSubject<SearchResult[]>([]);
  const state$ = new BehaviorSubject<SearchState>('idle');
  const error$ = new BehaviorSubject<SearchExecutionError | undefined>(undefined);
  const hasMore$ = new BehaviorSubject<boolean>(false);
  const setQuery = vi.fn();
  const loadMore = vi.fn(async () => {
    /* 无操作 */
  });
  const clear = vi.fn();
  const retry = vi.fn();
  const destroy = vi.fn();
  const handle: SearchHandle = {
    results$,
    state$,
    error$,
    hasMore$,
    setQuery,
    loadMore,
    clear,
    retry,
    destroy
  };
  return { handle, results$, state$, error$, hasMore$, setQuery, loadMore, clear, retry, destroy };
};

const makeSource = (handle: SearchHandle) => {
  const searchSpy = vi.fn(() => handle);
  const source: SearchSourceLike = { search: searchSpy };
  return { source, searchSpy };
};

const runInScope = <T>(fn: () => T): { result: T; stop: () => void } => {
  const scope = effectScope();
  const result = scope.run(fn) as T;
  return { result, stop: () => scope.stop() };
};

describe('useSearch (Vue binding, T039)', () => {
  it('initial refs mirror handle observables', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const { result, stop } = runInScope(() => useSearch(source));
    expect(result.query.value).toBe('');
    expect(result.results.value).toEqual([]);
    expect(result.state.value).toBe('idle');
    expect(result.hasMore.value).toBe(false);
    stop();
  });

  it('writing query.value calls handle.setQuery', async () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const { result, stop } = runInScope(() => useSearch(source));
    result.query.value = 'foo';
    await nextTick();
    expect(h.setQuery).toHaveBeenCalledWith('foo');
    stop();
  });

  it('handle observable updates propagate to refs', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const { result, stop } = runInScope(() => useSearch(source));
    const rows: SearchResult[] = [{ entity: 'A', collection: 'a', id: '1', rank: -1, matchedField: 'x', snippet: 's' }];
    h.results$.next(rows);
    h.state$.next('success');
    h.hasMore$.next(true);
    expect(result.results.value).toEqual(rows);
    expect(result.state.value).toBe('success');
    expect(result.hasMore.value).toBe(true);
    stop();
  });

  it('scope.stop triggers handle.destroy', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const { stop } = runInScope(() => useSearch(source));
    stop();
    expect(h.destroy).toHaveBeenCalledTimes(1);
  });

  it('clear() resets query ref and calls handle.clear', async () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const { result, stop } = runInScope(() => useSearch(source));
    result.query.value = 'foo';
    await nextTick();
    result.clear();
    await nextTick();
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(result.query.value).toBe('');
    stop();
  });

  it('passes initialQuery to source.search', () => {
    const h = makeHandle();
    const { source, searchSpy } = makeSource(h.handle);
    const { stop } = runInScope(() => useSearch(source, { initialQuery: 'hi' }));
    expect(searchSpy).toHaveBeenCalledWith('hi', { initialQuery: 'hi' });
    stop();
  });

  it('retry() and loadMore() forward to handle', async () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const { result, stop } = runInScope(() => useSearch(source));
    result.retry();
    await result.loadMore();
    expect(h.retry).toHaveBeenCalledTimes(1);
    expect(h.loadMore).toHaveBeenCalledTimes(1);
    stop();
  });

  it('调用时无 active effect scope 应 fail-fast 抛错，而非静默泄漏订阅', () => {
    const h = makeHandle();
    const { source, searchSpy } = makeSource(h.handle);
    expect(() => useSearch(source)).toThrow(/effectScope/);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('SSR 不得创建句柄或订阅，保留可水合的初始状态', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    try {
      const { useSearch: useSearchOnServer } = await import('../use-search.js');
      const fixture = makeHandle();
      const { source, searchSpy } = makeSource(fixture.handle);
      const sourceGetter = vi.fn(() => source);
      let result: ReturnType<typeof useSearchOnServer> | undefined;
      const Component = defineComponent({
        setup() {
          result = useSearchOnServer(sourceGetter, { initialQuery: 'ssr-query' });
          return () => h('output', result?.query.value);
        }
      });
      const html = await renderToString(Component);

      if (!result) throw new Error('SSR setup 未执行');

      expect(sourceGetter).not.toHaveBeenCalled();
      expect(searchSpy).not.toHaveBeenCalled();
      expect(html).toContain('ssr-query');
      expect(result.query.value).toBe('ssr-query');
      expect(result.results.value).toEqual([]);
      expect(result.state.value).toBe('idle');
      expect(result.error.value).toBeUndefined();
      expect(result.hasMore.value).toBe(false);

      await result.loadMore();
      result.clear();
      result.retry();

      expect(fixture.loadMore).not.toHaveBeenCalled();
      expect(fixture.clear).not.toHaveBeenCalled();
      expect(fixture.retry).not.toHaveBeenCalled();
      expect(fixture.destroy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  // SRCHV-002：cleanup 只 unsubscribe + destroy，没有置空引用 ——
  // `loadMore`/`clear`/`retry` 闭包捕获的仍是已销毁的 handle。
  // 真实 core handle 的 `loadMore()` 在销毁后若快照仍是 success+hasMore，还会重新发起搜索 I/O。
  it('scope 停止后所有命令必须 no-op', async () => {
    const { handle, loadMore, clear, retry } = makeHandle();
    const { source } = makeSource(handle);
    const { result, stop } = runInScope(() => useSearch(source));

    stop();
    await result.loadMore();
    result.clear();
    result.retry();

    expect(loadMore).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it('重复 stop 不抛错，命令仍然 no-op', async () => {
    const { handle, destroy, loadMore } = makeHandle();
    const { source } = makeSource(handle);
    const { result, stop } = runInScope(() => useSearch(source));

    stop();
    stop();

    expect(destroy).toHaveBeenCalledTimes(1);
    await expect(result.loadMore()).resolves.toBeUndefined();
    expect(loadMore).not.toHaveBeenCalled();
  });

  // SRCHV-003：results/state/error/hasMore 只应由 handle 驱动，
  // 却被原样返回成可写 `Ref` —— 调用方能把 idle 伪造成 error，
  // 在下一次 emission 之前 UI 与真实句柄永久分叉。
  // Angular 用只读 Signal、React 只返回值，同仓 rxdb-vue 的 provider 也用 Readonly<Ref>。
  it('handle 驱动的输出必须是只读的', () => {
    const { handle, state$ } = makeHandle();
    const { source } = makeSource(handle);
    const { result, stop } = runInScope(() => useSearch(source));

    // 编译期：只读 ref 不允许赋值
    // @ts-expect-error state 由 handle 驱动，调用方不得写入
    result.state.value = 'error';
    // @ts-expect-error results 由 handle 驱动，调用方不得写入
    result.results.value = [];

    // 运行期：Vue 的 readonly() 代理只 warn 不抛，关键是**写入不得生效**
    expect(result.state.value).toBe('idle');

    // handle 推来的新值仍然照常透传
    state$.next('success');
    expect(result.state.value).toBe('success');
    stop();
  });

  // SRCHV-005：`clear()` 先写 `query.value = ''` 触发默认 flush 的 watcher，
  // 下一 tick 又执行 `handle.setQuery('')` —— core handle 因此白建一个 debounce 任务再清一次状态。
  // Angular 绑定已用 `last=''` 显式避免这次双派发。
  it('clear() 不得额外派发 setQuery("")', async () => {
    const { handle, clear, setQuery } = makeHandle();
    const { source } = makeSource(handle);
    const { result, stop } = runInScope(() => useSearch(source));

    result.query.value = 'typed';
    await nextTick();
    setQuery.mockClear();

    result.clear();
    await nextTick();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(setQuery).not.toHaveBeenCalled();
    expect(result.query.value).toBe('');
    stop();
  });

  it('clear() 之后的新输入仍然正常派发', async () => {
    const { handle, setQuery } = makeHandle();
    const { source } = makeSource(handle);
    const { result, stop } = runInScope(() => useSearch(source));

    result.clear();
    await nextTick();
    result.query.value = 'next';
    await nextTick();

    expect(setQuery).toHaveBeenCalledWith('next');
    stop();
  });

  /**
   * SRCHV-004：`source` / `options` 此前被 setup 首次值**永久捕获** ——
   * 异步就绪的 DB ref、collection 切换、debounce/pageSize 调整都会继续查旧实例。
   *
   * 契约（三端同一答案，见 SRCHR-001 / SRA-008）：
   * 入参接受 `MaybeRefOrGetter`，解析值变化时重建 handle，**并保留用户当前 query**。
   */
  describe('SRCHV-004：响应式入参与重建契约', () => {
    it('source ref 变化时重建 handle，并以当前 query 播种', async () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceRef = shallowRef<SearchSourceLike>(a.source);
      const { result, stop } = runInScope(() => useSearch(sourceRef));

      result.query.value = '保留我';
      await nextTick();

      sourceRef.value = b.source;
      await nextTick();

      expect(first.destroy).toHaveBeenCalledTimes(1);
      expect(b.searchSpy).toHaveBeenCalledWith('保留我', undefined);
      expect(result.query.value).toBe('保留我');
      stop();
    });

    it('options getter 的语义变化触发重建，保留当前 query', async () => {
      const h = makeHandle();
      const { source, searchSpy } = makeSource(h.handle);
      const collections = shallowRef<readonly string[]>(['Todo']);
      const { result, stop } = runInScope(() => useSearch(source, () => ({ collections: collections.value })));

      result.query.value = '用户打到一半的词';
      await nextTick();

      collections.value = ['Article'];
      await nextTick();

      expect(searchSpy).toHaveBeenCalledTimes(2);
      expect(searchSpy).toHaveBeenNthCalledWith(2, '用户打到一半的词', { collections: ['Article'] });
      expect(result.query.value).toBe('用户打到一半的词');
      stop();
    });

    it('语义等价的 options 字面量重算不触发重建', async () => {
      const h = makeHandle();
      const { source, searchSpy } = makeSource(h.handle);
      const tick = shallowRef(0);
      const { stop } = runInScope(() =>
        useSearch(source, () => {
          void tick.value;
          return { collections: ['Todo'], debounce: 300 };
        })
      );

      tick.value = 1;
      await nextTick();
      tick.value = 2;
      await nextTick();

      expect(searchSpy).toHaveBeenCalledTimes(1);
      expect(h.destroy).not.toHaveBeenCalled();
      stop();
    });

    it('只有 initialQuery 变化不触发重建', async () => {
      const h = makeHandle();
      const { source, searchSpy } = makeSource(h.handle);
      const seed = shallowRef('');
      const { stop } = runInScope(() => useSearch(source, () => ({ initialQuery: seed.value })));

      seed.value = '用';
      await nextTick();
      seed.value = '用户';
      await nextTick();

      expect(searchSpy).toHaveBeenCalledTimes(1);
      stop();
    });

    it('重建后旧 handle 的晚到 emission 不再写入输出', async () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceRef = shallowRef<SearchSourceLike>(a.source);
      const { result, stop } = runInScope(() => useSearch(sourceRef));

      sourceRef.value = b.source;
      await nextTick();

      first.state$.next('error');
      first.results$.next([
        { entity: 'Todo', collection: 'todo', id: 'stale', rank: -1, matchedField: 'title', snippet: 'stale' }
      ]);
      await nextTick();

      expect(result.state.value).toBe('idle');
      expect(result.results.value).toEqual([]);
      stop();
    });

    it('重建后命令路由到新 handle，旧 handle 不再收到调用', async () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceRef = shallowRef<SearchSourceLike>(a.source);
      const { result, stop } = runInScope(() => useSearch(sourceRef));

      sourceRef.value = b.source;
      await nextTick();

      result.query.value = 'after';
      await nextTick();
      await result.loadMore();
      result.retry();

      expect(second.setQuery).toHaveBeenCalledWith('after');
      expect(second.loadMore).toHaveBeenCalledTimes(1);
      expect(second.retry).toHaveBeenCalledTimes(1);
      expect(first.setQuery).not.toHaveBeenCalled();
      expect(first.loadMore).not.toHaveBeenCalled();
      expect(first.retry).not.toHaveBeenCalled();
      stop();
    });

    it('scope 停止后销毁的是最新 handle', async () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceRef = shallowRef<SearchSourceLike>(a.source);
      const { stop } = runInScope(() => useSearch(sourceRef));

      sourceRef.value = b.source;
      await nextTick();
      stop();

      expect(first.destroy).toHaveBeenCalledTimes(1);
      expect(second.destroy).toHaveBeenCalledTimes(1);
    });
  });
});

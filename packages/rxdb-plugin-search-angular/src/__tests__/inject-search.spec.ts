import {
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  ErrorHandler,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal,
  type EnvironmentProviders,
  type Provider
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import {
  createSearchHandle,
  type SearchExecutionError,
  type SearchHandle,
  type SearchOptions,
  type SearchResult,
  type SearchState
} from '@aiao/rxdb-plugin-search';

import type { SearchSourceLike } from '../inject-search';
import { useSearch } from '../inject-search';

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

const configureTestingModule = () => {
  const providers: Array<Provider | EnvironmentProviders> = [provideZonelessChangeDetection()];

  TestBed.configureTestingModule({
    providers
  });
};

describe('useSearch (Angular binding, T039)', () => {
  beforeEach(() => {
    configureTestingModule();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('mirrors initial handle observables', () => {
    const h = makeHandle();
    const { source, searchSpy } = makeSource(h.handle);

    TestBed.runInInjectionContext(() => {
      const search = useSearch(source);

      expect(search.query()).toBe('');
      expect(search.results()).toEqual([]);
      expect(search.state()).toBe('idle');
      expect(search.error()).toBeUndefined();
      expect(search.hasMore()).toBe(false);
      expect(searchSpy).toHaveBeenCalledWith('', undefined);
    });
  });

  it('query signal forwards to handle.setQuery after effects flush', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);

    TestBed.runInInjectionContext(() => {
      const search = useSearch(source);

      search.query.set('foo');
      TestBed.flushEffects();

      expect(search.query()).toBe('foo');
      expect(h.setQuery).toHaveBeenCalledWith('foo');
    });
  });

  it('propagates results, state, error and hasMore updates into signals', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const rows: SearchResult[] = [
      { entity: 'Article', collection: 'article', id: '1', rank: -1, matchedField: 'title', snippet: 'foo' }
    ];
    const failure = new Error('boom') as SearchExecutionError;

    TestBed.runInInjectionContext(() => {
      const search = useSearch(source);

      h.results$.next(rows);
      h.state$.next('error');
      h.error$.next(failure);
      h.hasMore$.next(true);

      expect(search.results()).toEqual(rows);
      expect(search.state()).toBe('error');
      expect(search.error()).toBe(failure);
      expect(search.hasMore()).toBe(true);
    });
  });

  it('clear resets query and delegates to handle.clear', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);

    TestBed.runInInjectionContext(() => {
      const search = useSearch(source);

      search.query.set('foo');
      TestBed.flushEffects();
      search.clear();
      TestBed.flushEffects();

      expect(search.query()).toBe('');
      expect(h.clear).toHaveBeenCalledTimes(1);
    });
  });

  it('passes initialQuery to source.search and forwards retry/loadMore', async () => {
    const h = makeHandle();
    const { source, searchSpy } = makeSource(h.handle);

    await TestBed.runInInjectionContext(async () => {
      const search = useSearch(source, { initialQuery: 'hello' });

      search.retry();
      await search.loadMore();

      expect(search.query()).toBe('hello');
      expect(searchSpy).toHaveBeenCalledWith('hello', { initialQuery: 'hello' });
      expect(h.retry).toHaveBeenCalledTimes(1);
      expect(h.loadMore).toHaveBeenCalledTimes(1);
    });
  });

  it('registers cleanup on DestroyRef and tears down subscriptions', () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const parentInjector = TestBed.inject(EnvironmentInjector);
    const injector = createEnvironmentInjector([], parentInjector);
    let search: ReturnType<typeof useSearch> | undefined;

    runInInjectionContext(injector, () => {
      search = useSearch(source);
    });

    injector.destroy();

    expect(h.destroy).toHaveBeenCalledTimes(1);

    h.results$.next([
      { entity: 'Comment', collection: 'comment', id: '2', rank: -2, matchedField: 'body', snippet: 'bar' }
    ]);

    expect(search?.results()).toEqual([]);
  });

  it('does not route commands to a destroyed handle', async () => {
    const h = makeHandle();
    const { source } = makeSource(h.handle);
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    let search: ReturnType<typeof useSearch> | undefined;

    runInInjectionContext(injector, () => {
      search = useSearch(source);
    });
    injector.destroy();

    search?.query.set('late');
    await search?.loadMore();
    search?.retry();
    search?.clear();

    expect(h.setQuery).not.toHaveBeenCalled();
    expect(h.loadMore).not.toHaveBeenCalled();
    expect(h.retry).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
  });

  it('propagates source initialization failures', () => {
    const failure = new Error('search plugin is not ready');
    const source: SearchSourceLike = {
      search: () => {
        throw failure;
      }
    };

    expect(() => TestBed.runInInjectionContext(() => useSearch(source))).toThrow(failure);
  });

  it('bridges a real core handle across multiple pages', async () => {
    const page = (index: number): SearchResult => ({
      entity: 'Article',
      collection: 'article',
      id: String(index),
      rank: -index,
      matchedField: 'title',
      snippet: `page-${index}`
    });
    const performSearch = vi.fn(async (_query: string, index: number) => ({
      results: [page(index)],
      hasMore: index === 0
    }));
    const source: SearchSourceLike = {
      search: query => createSearchHandle({ performSearch, initialQuery: query, debounceMs: 0 })
    };
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    let search: ReturnType<typeof useSearch> | undefined;

    runInInjectionContext(injector, () => {
      search = useSearch(source, { initialQuery: 'angular' });
    });

    await vi.waitFor(() => expect(search?.state()).toBe('success'));
    expect(search?.results().map(result => result.id)).toEqual(['0']);
    expect(search?.hasMore()).toBe(true);

    await search?.loadMore();

    expect(search?.results().map(result => result.id)).toEqual(['0', '1']);
    expect(search?.hasMore()).toBe(false);
    expect(performSearch).toHaveBeenNthCalledWith(1, 'angular', 0, expect.any(AbortSignal));
    expect(performSearch).toHaveBeenNthCalledWith(2, 'angular', 1, expect.any(AbortSignal));

    injector.destroy();
  });
  // SRA-003：四个输出用 `signal()` 创建后**原样返回**，只靠 `Signal<T>` 注解隐藏写方法 ——
  // 运行时它们仍带 `.set/.update/.asReadonly`，JS 调用方、模板辅助代码或逃逸类型
  // 可直接伪造状态，使 UI 与 SearchHandle 永久分裂。Vue 已用 readonly()、React 只返回值。
  it('handle 驱动的输出必须是真正只读的 signal', () => {
    const { handle: h } = makeHandle();
    const { source } = makeSource(h);

    TestBed.runInInjectionContext(() => {
      const search = useSearch(source);

      for (const output of [search.results, search.state, search.error, search.hasMore]) {
        expect((output as unknown as Record<string, unknown>)['set']).toBeUndefined();
        expect((output as unknown as Record<string, unknown>)['update']).toBeUndefined();
      }
      // query 仍是唯一可写输出
      expect(search.query.set).toBeTypeOf('function');
    });
  });

  // SRA-004：四条订阅只传 next callback。任一流进入 error 时 RxJS 会走 reportUnhandledError，
  // Angular 的 error signal 与 ErrorHandler 都收不到，进程/应用可能直接崩溃。
  it('流 error 必须交给 Angular ErrorHandler，而不是逃逸成全局未捕获异常', () => {
    const { handle: h, state$ } = makeHandle();
    const { source } = makeSource(h);
    const handleError = vi.fn();

    TestBed.runInInjectionContext(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      void injector;
      const search = useSearch(source);
      void search;
    });

    // 用 TestBed 提供的 ErrorHandler 捕获
    const errorHandler = TestBed.inject(ErrorHandler);
    vi.spyOn(errorHandler, 'handleError').mockImplementation(handleError);

    const failure = new Error('stream-boom');
    expect(() => state$.error(failure)).not.toThrow();
    expect(handleError).toHaveBeenCalledWith(failure);
  });

  /**
   * SRA-008：`source` / `options` 都是普通值，handle 在注入时创建**一次**，
   * 此后 collection 切换、debounce/pageSize 调整、异步就绪的 DB 换实例都不会重建。
   *
   * 契约（三端同一答案，见 SRCHR-001 / SRCHV-004）：
   * 入参接受 `Signal`，解析值变化时重建 handle，**并保留用户当前 query**。
   */
  describe('SRA-008：Signal 入参与重建契约', () => {
    it('source signal 变化时重建 handle，并以当前 query 播种', () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceSignal = signal(a.source);

      TestBed.runInInjectionContext(() => {
        const search = useSearch(sourceSignal);

        search.query.set('保留我');
        TestBed.flushEffects();
        sourceSignal.set(b.source);
        TestBed.flushEffects();

        expect(first.destroy).toHaveBeenCalledTimes(1);
        expect(b.searchSpy).toHaveBeenCalledWith('保留我', undefined);
        expect(search.query()).toBe('保留我');
      });
    });

    it('options signal 的语义变化触发重建，保留当前 query', () => {
      const h = makeHandle();
      const { source, searchSpy } = makeSource(h.handle);
      const options = signal<SearchOptions | undefined>({ collections: ['Todo'] });

      TestBed.runInInjectionContext(() => {
        const search = useSearch(source, options);

        search.query.set('用户打到一半的词');
        TestBed.flushEffects();
        options.set({ collections: ['Article'] });
        TestBed.flushEffects();

        expect(searchSpy).toHaveBeenCalledTimes(2);
        expect(searchSpy).toHaveBeenNthCalledWith(2, '用户打到一半的词', { collections: ['Article'] });
        expect(search.query()).toBe('用户打到一半的词');
      });
    });

    it('语义等价的 options 重算不触发重建', () => {
      const h = makeHandle();
      const { source, searchSpy } = makeSource(h.handle);
      const tick = signal(0);
      const options = computed<SearchOptions>(() => {
        void tick();
        return { collections: ['Todo'], debounce: 300 };
      });

      TestBed.runInInjectionContext(() => {
        useSearch(source, options);

        tick.set(1);
        TestBed.flushEffects();
        tick.set(2);
        TestBed.flushEffects();

        expect(searchSpy).toHaveBeenCalledTimes(1);
        expect(h.destroy).not.toHaveBeenCalled();
      });
    });

    it('只有 initialQuery 变化不触发重建', () => {
      const h = makeHandle();
      const { source, searchSpy } = makeSource(h.handle);
      const seed = signal('');
      const options = computed<SearchOptions>(() => ({ initialQuery: seed() }));

      TestBed.runInInjectionContext(() => {
        useSearch(source, options);

        seed.set('用');
        TestBed.flushEffects();
        seed.set('用户');
        TestBed.flushEffects();

        expect(searchSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('重建后旧 handle 的晚到 emission 不再写入 signal', () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceSignal = signal(a.source);

      TestBed.runInInjectionContext(() => {
        const search = useSearch(sourceSignal);

        sourceSignal.set(b.source);
        TestBed.flushEffects();

        first.state$.next('error');
        first.hasMore$.next(true);

        expect(search.state()).toBe('idle');
        expect(search.hasMore()).toBe(false);
      });
    });

    it('重建后命令路由到新 handle，旧 handle 不再收到调用', async () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceSignal = signal(a.source);

      await TestBed.runInInjectionContext(async () => {
        const search = useSearch(sourceSignal);

        sourceSignal.set(b.source);
        TestBed.flushEffects();

        search.query.set('after');
        TestBed.flushEffects();
        await search.loadMore();
        search.retry();
        search.clear();

        expect(second.setQuery).toHaveBeenCalledWith('after');
        expect(second.loadMore).toHaveBeenCalledTimes(1);
        expect(second.retry).toHaveBeenCalledTimes(1);
        expect(second.clear).toHaveBeenCalledTimes(1);
        expect(first.setQuery).not.toHaveBeenCalled();
        expect(first.loadMore).not.toHaveBeenCalled();
        expect(first.retry).not.toHaveBeenCalled();
        expect(first.clear).not.toHaveBeenCalled();
      });
    });

    it('injector 销毁时释放的是最新 handle', () => {
      const first = makeHandle();
      const second = makeHandle();
      const a = makeSource(first.handle);
      const b = makeSource(second.handle);
      const sourceSignal = signal(a.source);
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

      runInInjectionContext(injector, () => {
        useSearch(sourceSignal);
      });
      sourceSignal.set(b.source);
      TestBed.flushEffects();
      injector.destroy();

      expect(first.destroy).toHaveBeenCalledTimes(1);
      expect(second.destroy).toHaveBeenCalledTimes(1);
    });
  });
});

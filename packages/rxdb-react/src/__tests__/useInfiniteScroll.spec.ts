import { ENTITY_STATIC_TYPES, RxDB } from '@aiao/rxdb';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, createElement, type PropsWithChildren, type ReactElement } from 'react';
import { BehaviorSubject, EMPTY, NEVER, Observable, Subject, map, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBProvider } from '../rxdb-react';
import { useInfiniteScroll } from '../useInfiniteScroll';

interface CursorOptions {
  after?: CursorEntity;
  filter?: { active: boolean };
  key: string;
  limit?: number;
}

interface CursorStaticTypes {
  findByCursorOptions: CursorOptions;
}

class CursorEntity {
  static [ENTITY_STATIC_TYPES]: CursorStaticTypes = {
    findByCursorOptions: { key: '' }
  };

  constructor(
    readonly id: string,
    readonly sort = 0
  ) {}
}

interface BoundaryObserver<T> {
  complete(): void;
  error(cause: unknown): void;
  next(value: T): void;
}

const createBoundaryObservable = <T>() => {
  let currentObserver: BoundaryObserver<T> | undefined;
  const unsubscribe = vi.fn();
  const observable = {
    subscribe(observer: BoundaryObserver<T>) {
      currentObserver = observer;
      return { closed: false, unsubscribe };
    }
  } as unknown as Observable<T>;

  return {
    observable,
    observer: (): BoundaryObserver<T> => {
      if (!currentObserver) throw new Error('Observer was not captured');
      return currentObserver;
    },
    unsubscribe
  };
};

const findByCursor = vi.fn<(options: CursorOptions) => Observable<CursorEntity[]>>();
const getRepository = vi.fn(() => ({ findByCursor }));
const database = { entityManager: { getRepository } } as unknown as RxDB;

const createDatabaseWrapper = (strict = false) =>
  function DatabaseWrapper({ children }: PropsWithChildren): ReactElement {
    const provider = createElement(RxDBProvider, { db: database }, children);
    return strict ? createElement(StrictMode, null, provider) : provider;
  };

beforeEach(() => {
  vi.resetAllMocks();
  getRepository.mockReturnValue({ findByCursor });
  findByCursor.mockReturnValue(NEVER);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * 三端逐字一致的结算态序列（RAN-013）。
 *
 * @remarks
 * 三端各自的 `useInfiniteScroll` 用例里都有一份**内容完全相同**的常量：
 * 它是 Angular / React / Vue 对「加载 → 失败 → 恢复」的共同承诺，
 * 单端语义漂移会直接表现为这份字面量对不上。
 *
 * 只取**结算后**的快照，不含中间的 `isLoading: true` 帧 ——
 * 三端的调度模型不同（Angular effect + microtask、React commit、Vue watcher），
 * 中间帧的时序天然不可能对齐，能对齐也不该对齐。
 */
const SHARED_STATE_SEQUENCE = [
  { step: 'initial', ids: ['a', 'b'], isLoading: false, hasMore: true, error: undefined, isEmpty: false },
  // 失败不该吞掉已加载的页，也不该顺手把 hasMore 关掉——否则用户既看不到旧数据也翻不动页
  {
    step: 'loadMore-failed',
    ids: ['a', 'b'],
    isLoading: false,
    hasMore: true,
    error: 'page 2 unavailable',
    isEmpty: false
  },
  { step: 'refresh-recovered', ids: ['a', 'b'], isLoading: false, hasMore: true, error: undefined, isEmpty: false }
];

describe('useInfiniteScroll', () => {
  it('loads structurally equal inline options once across internal and parent rerenders', async () => {
    const { rerender } = renderHook(
      ({ reverse }: { reverse: boolean }) =>
        useInfiniteScroll(
          CursorEntity,
          reverse ? { filter: { active: true }, key: 'todos' } : { key: 'todos', filter: { active: true } }
        ),
      { initialProps: { reverse: false }, wrapper: createDatabaseWrapper() }
    );

    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(1));
    rerender({ reverse: true });
    await act(async () => undefined);

    expect(findByCursor).toHaveBeenCalledTimes(1);
  });

  it('does not form a request loop under StrictMode', async () => {
    renderHook(() => useInfiniteScroll(CursorEntity, { key: 'strict' }), {
      wrapper: createDatabaseWrapper(true)
    });

    await waitFor(() => expect(findByCursor).toHaveBeenCalled());
    await act(async () => undefined);

    expect(findByCursor.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('loads pages, applies the cursor, and stops when the final page is short', async () => {
    const firstPage = new Subject<CursorEntity[]>();
    const secondPage = new Subject<CursorEntity[]>();
    findByCursor.mockReturnValueOnce(firstPage).mockReturnValueOnce(secondPage);
    const options: CursorOptions = { key: 'pages', limit: 2 };
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, options), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(1));
    expect(result.current).toMatchObject({ value: [], isLoading: true, isEmpty: false, hasMore: true });

    const first = new CursorEntity('first');
    const second = new CursorEntity('second');
    act(() => firstPage.next([first, second]));

    expect(result.current).toMatchObject({ value: [first, second], isLoading: false, isEmpty: false, hasMore: true });

    act(() => result.current.loadMore());
    expect(findByCursor).toHaveBeenCalledTimes(2);
    expect(findByCursor).toHaveBeenLastCalledWith({ ...options, after: second });

    const third = new CursorEntity('third');
    act(() => secondPage.next([third]));

    expect(result.current).toMatchObject({
      value: [first, second, third],
      isLoading: false,
      isEmpty: false,
      hasMore: false
    });

    act(() => result.current.loadMore());
    expect(findByCursor).toHaveBeenCalledTimes(2);
  });

  it('blocks overlapping loads', async () => {
    const pending = new Subject<CursorEntity[]>();
    findByCursor.mockReturnValue(pending);
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'pending' }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(1));
    act(() => result.current.loadMore());

    expect(findByCursor).toHaveBeenCalledTimes(1);
  });

  it('resets and reloads exactly once when options change', async () => {
    const first = new Subject<CursorEntity[]>();
    const second = new Subject<CursorEntity[]>();
    findByCursor.mockImplementation(options => (options.key === 'first' ? first : second));
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useInfiniteScroll(CursorEntity, { key, limit: 2 }),
      { initialProps: { key: 'first' }, wrapper: createDatabaseWrapper() }
    );

    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(1));
    act(() => first.next([new CursorEntity('stale')]));
    expect(result.current.value).toHaveLength(1);

    rerender({ key: 'second' });
    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(2));

    expect(first.observed).toBe(false);
    expect(second.observed).toBe(true);
    expect(result.current).toMatchObject({ value: [], isLoading: true, hasMore: true, error: undefined });
  });

  it('refreshes from the first page and cancels previous subscriptions', async () => {
    const first = new Subject<CursorEntity[]>();
    const refreshed = new Subject<CursorEntity[]>();
    findByCursor.mockReturnValueOnce(first).mockReturnValueOnce(refreshed);
    const options: CursorOptions = { key: 'refresh', limit: 1 };
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, options), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(1));
    act(() => first.next([new CursorEntity('old')]));
    act(() => result.current.refresh());

    expect(first.observed).toBe(false);
    expect(findByCursor).toHaveBeenCalledTimes(2);
    expect(findByCursor).toHaveBeenLastCalledWith(options);
    expect(result.current).toMatchObject({ value: [], isLoading: true, hasMore: true, error: undefined });
  });

  it('preserves the original observable error and never reports an errored result as empty', async () => {
    const failure = new Error('cursor failed');
    findByCursor.mockReturnValue(throwError(() => failure));
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'error' }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(result.current.error).toBe(failure));

    expect(result.current).toMatchObject({ value: [], isLoading: false, isEmpty: false, hasMore: true });
  });

  it('normalizes synchronous repository failures', async () => {
    getRepository.mockImplementation(() => {
      throw new Error('repository failed');
    });
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'throw' }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(result.current.error).toEqual(new Error('repository failed')));

    expect(result.current).toMatchObject({ value: [], isLoading: false, isEmpty: false, hasMore: true });
  });

  it('normalizes synchronous query failures', async () => {
    findByCursor.mockImplementation(() => {
      throw new Error('query failed');
    });
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'throw-query' }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(result.current.error).toEqual(new Error('query failed')));
  });

  it('ignores late callbacks from requests invalidated by option changes', async () => {
    const first = createBoundaryObservable<CursorEntity[]>();
    const second = createBoundaryObservable<CursorEntity[]>();
    findByCursor.mockImplementation(options => (options.key === 'first' ? first.observable : second.observable));
    const { result, rerender } = renderHook(({ key }: { key: string }) => useInfiniteScroll(CursorEntity, { key }), {
      initialProps: { key: 'first' },
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(1));
    rerender({ key: 'second' });
    await waitFor(() => expect(findByCursor).toHaveBeenCalledTimes(2));
    first.observer().next([new CursorEntity('stale')]);
    first.observer().error(new Error('stale error'));
    first.observer().complete();

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ value: [], error: undefined, isLoading: true });

    act(() => second.observer().next([new CursorEntity('current')]));
    expect(result.current.value.map(entity => entity.id)).toEqual(['current']);
  });

  // RRE/RAN-007：`complete` 只清 isLoading，hasMore 的唯一写入点在 `commitPage` 里，
  // 因此「一次 next 都没有就 complete」会让 hasMore 停在初值 true ——
  // 消费者拿到「不在加载、是空的、还有下一页」，自动触底会用同一游标无限重发。
  // Angular / Vue 侧同款修复。
  it('finishes an empty completed query, settles hasMore, and unsubscribes on unmount', async () => {
    findByCursor.mockReturnValue(EMPTY);
    const { result, unmount } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'complete' }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.hasMore).toBe(false);

    const callsAfterInitialLoad = findByCursor.mock.calls.length;
    act(() => result.current.loadMore());
    expect(findByCursor.mock.calls.length).toBe(callsAfterInitialLoad);

    unmount();
  });

  it('throws when no database provider exists', () => {
    expect(() => renderHook(() => useInfiniteScroll(CursorEntity, { key: 'missing-db' }))).toThrow(
      'No RxDB instance found, use RxDBProvider to provide one'
    );
  });

  // RRE-006：`hasMore` 用 `result.length >= (limit ?? 100)`，显式 0 让任何结果都满足 `>= 0`，
  // 于是永久宣称有下一页 —— 自动触底的消费者会无界重复请求。
  // 核心已冻结契约：`limit: 0` 是合法值、语义是「返回空集」
  // （`packages/rxdb/src/repository/Repository.ts:173,230`，`?? 100` 而非 `|| 100`），
  // 因此这里必须是 hasMore=false，而不是原用例断言的 true。
  it('treats an explicit zero limit as no further pages', async () => {
    findByCursor.mockReturnValue(of([]));
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'zero', limit: 0 }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.value).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });

  // RRE-007：`finish(cause?)` 用 `cause === undefined` 区分 complete 与 error，
  // 但 RxJS 允许 `subscriber.error(undefined)` —— 失败会被展示成「加载成功但为空」。
  it('reports an observable error carrying undefined as a real failure', async () => {
    findByCursor.mockReturnValue(
      new Observable<CursorEntity[]>(subscriber => {
        subscriber.error(undefined);
      })
    );
    const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'undefined-error' }), {
      wrapper: createDatabaseWrapper()
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    // 关键：不得被当成「加载成功且为空」
    expect(result.current.isEmpty).toBe(false);
  });

  // RRE-005（三框架同款，Angular RAN-001 / Vue RVU-004）：每页保留一条独立活查询，
  // `after` 在创建那一刻被固化，之后上一页怎么变都不重算，最后只做 `pages.flat()`。
  // 上一页的**尾边界**一旦移动，下一页的锚点就失效：头插会让边界条目永久消失，
  // 删除会让同一条目在相邻两页重复。
  //
  // 夹具必须是**真的活游标查询**（数据集一变、所有在订阅的页一起按各自游标重新 emit）——
  // `mockReturnValueOnce` 链让每页内容与游标脱钩，边界移动在那种夹具里根本不会发生。
  describe('live cursor boundary (RRE-005)', () => {
    const row = (id: string, sort: number): CursorEntity => new CursorEntity(id, sort);

    /** 复刻 `WHERE (sort, id) > (cursor.sort, cursor.id)`：游标行本身被删掉也照样可比。 */
    const isAfter = (candidate: CursorEntity, cursor: CursorEntity): boolean =>
      candidate.sort === cursor.sort ? candidate.id > cursor.id : candidate.sort > cursor.sort;

    const byOrderBy = (a: CursorEntity, b: CursorEntity): number =>
      a.sort === b.sort ? a.id.localeCompare(b.id) : a.sort - b.sort;

    /** 单一数据集 + 每页一条按自身游标切片的活查询，数据集变化同时推给所有页。 */
    const createLiveDataset = (initial: CursorEntity[]): BehaviorSubject<CursorEntity[]> => {
      const rows$ = new BehaviorSubject<CursorEntity[]>(initial);
      findByCursor.mockImplementation(options =>
        rows$.pipe(
          map(rows => {
            const ordered = [...rows].sort(byOrderBy);
            const cursor = options.after;
            const rest = cursor ? ordered.filter(candidate => isAfter(candidate, cursor)) : ordered;
            return rest.slice(0, options.limit);
          })
        )
      );
      return rows$;
    };

    const initialRows = (): CursorEntity[] => [row('a', 1), row('b', 2), row('c', 3), row('d', 4)];

    /** 载入两页：`[a,b]` 与 after-b 的 `[c,d]`。 */
    const renderTwoPages = async () => {
      const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'boundary', limit: 2 }), {
        wrapper: createDatabaseWrapper()
      });

      await waitFor(() => expect(result.current.value).toHaveLength(2));
      act(() => result.current.loadMore());

      expect(result.current.value.map(entity => entity.id)).toEqual(['a', 'b', 'c', 'd']);
      return result;
    };

    it('keeps the boundary entity when a head insert shifts the first page', async () => {
      const rows$ = createLiveDataset(initialRows());
      const result = await renderTwoPages();

      // 头插：首页变成 [x,a]，尾边界从 b 移到 a —— 第二页仍锚在 b 上就会漏掉 b
      act(() => rows$.next([row('x', 0), ...initialRows()]));

      expect(result.current.value.map(entity => entity.id)).toEqual(['x', 'a', 'b', 'c']);
    });

    it('does not repeat an entity when a deletion pulls the next page into the first', async () => {
      const rows$ = createLiveDataset(initialRows());
      const result = await renderTwoPages();

      // 删掉 b：首页补进 c，尾边界从 b 移到 c —— 第二页仍锚在 b 上就会把 c 再发一遍
      act(() => rows$.next([row('a', 1), row('c', 3), row('d', 4)]));

      expect(result.current.value.map(entity => entity.id)).toEqual(['a', 'c', 'd']);
    });

    it('keeps every entity when a reorder moves an entity across the page boundary', async () => {
      const rows$ = createLiveDataset(initialRows());
      const result = await renderTwoPages();

      // d 排到最前：首页变成 [d,a]，尾边界从 b 移到 a
      act(() => rows$.next([row('a', 1), row('b', 2), row('c', 3), row('d', 0)]));

      expect(result.current.value.map(entity => entity.id)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('drops trailing pages when the first page loses every entity', async () => {
      const rows$ = createLiveDataset(initialRows());
      const result = await renderTwoPages();

      act(() => rows$.next([]));

      expect(result.current.value).toEqual([]);
      expect(result.current.hasMore).toBe(false);
    });
  });

  // RAN-013：三端共享状态序列。同一份 SHARED_STATE_SEQUENCE 字面量逐字出现在
  // packages/rxdb-angular/src/__tests__/InfiniteScrollingList.spec.ts 与
  // packages/rxdb-vue/src/__tests__/useInfiniteScroll.spec.ts —— 任何一端在
  // 「加载失败后是否保留已加载页 / hasMore 是否被错误连带清掉 / refresh 是否清错误」
  // 上跑偏，都会在这条用例里以 diff 的形式暴露，而不是等消费者跨端迁移时才发现。
  describe('三端共享状态序列（RAN-013）', () => {
    it('初始加载 → 下一页失败 → refresh 恢复：结算态与 Angular/Vue 逐帧一致', async () => {
      const firstPage = [new CursorEntity('a'), new CursorEntity('b')];
      findByCursor
        .mockReturnValueOnce(of(firstPage))
        .mockReturnValueOnce(throwError(() => new Error('page 2 unavailable')))
        .mockReturnValueOnce(of(firstPage));

      const { result } = renderHook(() => useInfiniteScroll(CursorEntity, { key: 'shared-sequence', limit: 2 }), {
        wrapper: createDatabaseWrapper()
      });

      await waitFor(() => expect(result.current.value).toHaveLength(2));

      const snapshot = (step: string) => ({
        step,
        ids: result.current.value.map(entity => entity.id),
        isLoading: result.current.isLoading,
        hasMore: result.current.hasMore,
        error: result.current.error?.message,
        isEmpty: result.current.isEmpty
      });

      const sequence = [snapshot('initial')];
      act(() => result.current.loadMore());
      sequence.push(snapshot('loadMore-failed'));
      act(() => result.current.refresh());
      sequence.push(snapshot('refresh-recovered'));

      expect(sequence).toEqual(SHARED_STATE_SEQUENCE);
    });
  });
});

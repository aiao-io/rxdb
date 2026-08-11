import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import {
  createGraphQueryResult,
  type GraphPath,
  type GraphQueryResult,
  type NeighborResult
} from '@aiao/rxdb-plugin-graph';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { EMPTY, Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCount,
  useCountAncestors,
  useCountDescendants,
  useCountNeighbors,
  useFind,
  useFindAll,
  useFindAncestors,
  useFindByCursor,
  useFindDescendants,
  useFindOne,
  useFindOneOrFail,
  useGet,
  useGraphNeighbors,
  useGraphPaths
} from '../hooks';

type QueryMode = 'async' | 'complete' | 'error' | 'throw' | 'value';

interface QueryOptions {
  filter?: { active: boolean };
  key: string;
  mode?: QueryMode;
  requestedAt?: Date;
}

interface CursorOptions extends QueryOptions {
  after?: TestEntity;
  limit?: number;
}

interface TestEntityStaticTypes {
  idType: string;
  getOptions: QueryOptions;
  findOneOptions: QueryOptions;
  findOneOrFailOptions: QueryOptions;
  findOptions: QueryOptions;
  findByCursorOptions: CursorOptions;
  findAllOptions: QueryOptions;
  countOptions: QueryOptions;
  findTreeOptions: QueryOptions;
  findNeighborsOptions: QueryOptions;
  findPathsOptions: QueryOptions;
}

const queryMocks = {
  get: vi.fn<(options: QueryOptions) => Observable<TestEntity | undefined>>(),
  findOne: vi.fn<(options: QueryOptions) => Observable<TestEntity | undefined>>(),
  findOneOrFail: vi.fn<(options: QueryOptions) => Observable<TestEntity>>(),
  find: vi.fn<(options: QueryOptions) => Observable<TestEntity[]>>(),
  findByCursor: vi.fn<(options: CursorOptions) => Observable<TestEntity[]>>(),
  findAll: vi.fn<(options: QueryOptions) => Observable<TestEntity[]>>(),
  count: vi.fn<(options: QueryOptions) => Observable<number>>(),
  findDescendants: vi.fn<(options: QueryOptions) => Observable<TestEntity[]>>(),
  countDescendants: vi.fn<(options: QueryOptions) => Observable<number>>(),
  findAncestors: vi.fn<(options: QueryOptions) => Observable<TestEntity[]>>(),
  countAncestors: vi.fn<(options: QueryOptions) => Observable<number>>(),
  findNeighbors$: vi.fn<(options: QueryOptions) => Observable<GraphQueryResult<NeighborResult<typeof TestEntity>>>>(),
  countNeighbors$: vi.fn<(options: QueryOptions) => Observable<number>>(),
  findPaths$: vi.fn<(options: QueryOptions) => Observable<GraphQueryResult<GraphPath<typeof TestEntity>>>>()
};

class TestEntity {
  static [ENTITY_STATIC_TYPES]: TestEntityStaticTypes = {
    idType: '',
    getOptions: { key: '' },
    findOneOptions: { key: '' },
    findOneOrFailOptions: { key: '' },
    findOptions: { key: '' },
    findByCursorOptions: { key: '' },
    findAllOptions: { key: '' },
    countOptions: { key: '' },
    findTreeOptions: { key: '' },
    findNeighborsOptions: { key: '' },
    findPathsOptions: { key: '' }
  };

  // RAN-014：树/图 hooks 已收紧到 TreeEntityType / GraphEntityType，
  // 实例必须满足 IEntity（id + createdAt + updatedAt）才能作为它们的实参
  readonly createdAt = new Date(0);
  readonly updatedAt = new Date(0);

  constructor(
    readonly id = 'entity',
    readonly name = 'Entity'
  ) {}

  static get(options: QueryOptions): Observable<TestEntity | undefined> {
    return queryMocks.get(options);
  }

  static findOne(options: QueryOptions): Observable<TestEntity | undefined> {
    return queryMocks.findOne(options);
  }

  static findOneOrFail(options: QueryOptions): Observable<TestEntity> {
    return queryMocks.findOneOrFail(options);
  }

  static find(options: QueryOptions): Observable<TestEntity[]> {
    return queryMocks.find(options);
  }

  static findByCursor(options: CursorOptions): Observable<TestEntity[]> {
    return queryMocks.findByCursor(options);
  }

  static findAll(options: QueryOptions): Observable<TestEntity[]> {
    return queryMocks.findAll(options);
  }

  static count(options: QueryOptions): Observable<number> {
    return queryMocks.count(options);
  }

  static findDescendants(options: QueryOptions): Observable<TestEntity[]> {
    return queryMocks.findDescendants(options);
  }

  static countDescendants(options: QueryOptions): Observable<number> {
    return queryMocks.countDescendants(options);
  }

  static findAncestors(options: QueryOptions): Observable<TestEntity[]> {
    return queryMocks.findAncestors(options);
  }

  static countAncestors(options: QueryOptions): Observable<number> {
    return queryMocks.countAncestors(options);
  }

  static findNeighbors$(options: QueryOptions): Observable<GraphQueryResult<NeighborResult<typeof TestEntity>>> {
    return queryMocks.findNeighbors$(options);
  }

  static countNeighbors$(options: QueryOptions): Observable<number> {
    return queryMocks.countNeighbors$(options);
  }

  static findPaths$(options: QueryOptions): Observable<GraphQueryResult<GraphPath<typeof TestEntity>>> {
    return queryMocks.findPaths$(options);
  }
}

class MissingGetEntity {
  static [ENTITY_STATIC_TYPES] = {
    getOptions: { key: '' } as QueryOptions
  };
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
      return { unsubscribe };
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

const setDefaultQueryResults = (): void => {
  queryMocks.get.mockReturnValue(of(new TestEntity('get')));
  queryMocks.findOne.mockReturnValue(of(new TestEntity('find-one')));
  queryMocks.findOneOrFail.mockReturnValue(of(new TestEntity('find-one-or-fail')));
  queryMocks.find.mockReturnValue(of([new TestEntity('find')]));
  queryMocks.findByCursor.mockReturnValue(of([new TestEntity('cursor')]));
  queryMocks.findAll.mockReturnValue(of([new TestEntity('find-all')]));
  queryMocks.count.mockReturnValue(of(7));
  queryMocks.findDescendants.mockReturnValue(of([new TestEntity('descendant')]));
  queryMocks.countDescendants.mockReturnValue(of(2));
  queryMocks.findAncestors.mockReturnValue(of([new TestEntity('ancestor')]));
  queryMocks.countAncestors.mockReturnValue(of(1));
  queryMocks.findNeighbors$.mockReturnValue(
    of(
      createGraphQueryResult(
        [
          {
            node: new TestEntity('neighbor'),
            edge: { sourceId: 'source', targetId: 'neighbor', direction: 'out' as const },
            level: 1
          }
        ],
        false
      )
    )
  );
  queryMocks.countNeighbors$.mockReturnValue(of(3));
  queryMocks.findPaths$.mockReturnValue(
    of(
      createGraphQueryResult(
        [
          {
            nodes: [new TestEntity('from'), new TestEntity('to')],
            edges: [{ sourceId: 'from', targetId: 'to' }],
            length: 1
          }
        ],
        false
      )
    )
  );
};

beforeEach(() => {
  vi.resetAllMocks();
  setDefaultQueryResults();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('repository query lifecycle', () => {
  it('subscribes once for structurally equal inline options and reloads only after a semantic change', async () => {
    const first = new Subject<TestEntity[]>();
    const second = new Subject<TestEntity[]>();
    queryMocks.find.mockImplementation(options => (options.key === 'first' ? first : second));

    const { rerender } = renderHook(
      ({ key, reverse }: { key: string; reverse: boolean }) =>
        useFind(TestEntity, reverse ? { filter: { active: true }, key } : { key, filter: { active: true } }),
      { initialProps: { key: 'first', reverse: false } }
    );

    await waitFor(() => expect(queryMocks.find).toHaveBeenCalledTimes(1));
    rerender({ key: 'first', reverse: true });
    await act(async () => undefined);

    expect(queryMocks.find).toHaveBeenCalledTimes(1);
    expect(first.observed).toBe(true);

    rerender({ key: 'second', reverse: false });
    await waitFor(() => expect(queryMocks.find).toHaveBeenCalledTimes(2));

    expect(first.observed).toBe(false);
    expect(second.observed).toBe(true);
  });

  // StrictMode 会 mount → cleanup → mount，effect 因此跑两遍；订阅是同步发起的，
  // 所以查询工厂确实被调用两次，但第一次的订阅必须已被 cleanup 退掉，只留一个活订阅。
  it('leaves exactly one live subscription after StrictMode discards the first effect lifecycle', async () => {
    const stream = new Subject<TestEntity[]>();
    queryMocks.find.mockReturnValue(stream);

    renderHook(() => useFind(TestEntity, { key: 'strict' }), { wrapper: StrictMode });

    await waitFor(() => expect(stream.observed).toBe(true));
    expect(stream.observers).toHaveLength(1);
  });

  it('treats equal dates returned by inline option factories as the same query', async () => {
    const stream = new Subject<TestEntity | undefined>();
    queryMocks.get.mockReturnValue(stream);
    const { rerender } = renderHook(
      ({ tick }: { tick: number }) =>
        useGet(TestEntity, () => ({ key: 'dated', requestedAt: new Date('2026-01-02T03:04:05.000Z') })),
      { initialProps: { tick: 0 } }
    );

    await waitFor(() => expect(queryMocks.get).toHaveBeenCalledTimes(1));
    rerender({ tick: 1 });
    await act(async () => undefined);

    expect(queryMocks.get).toHaveBeenCalledTimes(1);
  });

  it('keeps the last value but resets metadata while a replacement query is loading', async () => {
    const stale = new TestEntity('stale');
    const pending = new Subject<TestEntity | undefined>();
    queryMocks.get.mockImplementation(options => (options.mode === 'async' ? pending : of(stale)));
    const { result, rerender } = renderHook(
      ({ mode }: { mode: QueryMode }) => useGet(TestEntity, { key: mode, mode }),
      { initialProps: { mode: 'value' as QueryMode } }
    );

    await waitFor(() => expect(result.current.hasValue).toBe(true));
    rerender({ mode: 'async' });
    await waitFor(() => expect(queryMocks.get).toHaveBeenCalledTimes(2));

    expect(result.current).toMatchObject({
      value: stale,
      error: undefined,
      isLoading: true,
      isEmpty: undefined,
      hasValue: false
    });
  });

  it('preserves the last value and original error while clearing stale metadata', async () => {
    const stale = new TestEntity('stale');
    const failure = new Error('query failed');
    queryMocks.findOne.mockImplementation(options =>
      options.mode === 'error' ? throwError(() => failure) : of(stale)
    );
    const { result, rerender } = renderHook(
      ({ mode }: { mode: QueryMode }) => useFindOne(TestEntity, { key: mode, mode }),
      { initialProps: { mode: 'value' as QueryMode } }
    );

    await waitFor(() => expect(result.current.value).toBe(stale));
    rerender({ mode: 'error' });
    await waitFor(() => expect(result.current.error).toBe(failure));

    expect(result.current).toMatchObject({
      value: stale,
      isLoading: false,
      isEmpty: undefined,
      hasValue: false
    });
  });

  it('normalizes synchronous failures and resets stale metadata', async () => {
    const stale = new TestEntity('stale');
    queryMocks.get.mockImplementation(options => {
      if (options.mode === 'throw') throw new Error('synchronous failure');
      return of(stale);
    });
    const { result, rerender } = renderHook(
      ({ mode }: { mode: QueryMode }) => useGet(TestEntity, { key: mode, mode }),
      { initialProps: { mode: 'value' as QueryMode } }
    );

    await waitFor(() => expect(result.current.value).toBe(stale));
    rerender({ mode: 'throw' });
    await waitFor(() => expect(result.current.error).toEqual(new Error('synchronous failure')));

    expect(result.current).toMatchObject({
      value: stale,
      isLoading: false,
      isEmpty: undefined,
      hasValue: false
    });
  });

  it('finishes loading when a query completes without emitting', async () => {
    queryMocks.get.mockReturnValue(EMPTY);
    const { result } = renderHook(() => useGet(TestEntity, { key: 'complete', mode: 'complete' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toEqual({
      value: undefined,
      error: undefined,
      isLoading: false,
      isEmpty: undefined,
      hasValue: false
    });
  });

  it('reports a missing repository method without fabricating a value', async () => {
    const { result } = renderHook(() => useGet(MissingGetEntity, { key: 'missing' }));

    await waitFor(() => expect(result.current.error?.message).toBe('Method "get" not found on EntityType'));

    expect(result.current).toMatchObject({ isLoading: false, isEmpty: undefined, hasValue: false });
  });

  it('ignores late callbacks from superseded queries and unsubscribes on unmount', async () => {
    const first = createBoundaryObservable<TestEntity | undefined>();
    const second = createBoundaryObservable<TestEntity | undefined>();
    queryMocks.get.mockImplementation(options => (options.key === 'first' ? first.observable : second.observable));
    const { result, rerender, unmount } = renderHook(({ key }: { key: string }) => useGet(TestEntity, { key }), {
      initialProps: { key: 'first' }
    });

    await waitFor(() => expect(queryMocks.get).toHaveBeenCalledTimes(1));
    rerender({ key: 'second' });
    await waitFor(() => expect(queryMocks.get).toHaveBeenCalledTimes(2));
    first.observer().next(new TestEntity('stale'));
    first.observer().error(new Error('stale error'));
    first.observer().complete();

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      value: undefined,
      error: undefined,
      isLoading: true,
      isEmpty: undefined,
      hasValue: false
    });

    act(() => second.observer().next(new TestEntity('current')));
    expect(result.current.value?.id).toBe('current');
    unmount();
    expect(second.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('derives empty state for arrays, absent entities, and scalar zero', async () => {
    queryMocks.find.mockReturnValue(of([]));
    queryMocks.get.mockReturnValue(of(undefined));
    queryMocks.count.mockReturnValue(of(0));
    const arrayResource = renderHook(() => useFind(TestEntity, { key: 'array' }));
    const entityResource = renderHook(() => useGet(TestEntity, { key: 'entity' }));
    const countResource = renderHook(() => useCount(TestEntity, { key: 'count' }));

    await waitFor(() => expect(arrayResource.result.current.hasValue).toBe(true));
    await waitFor(() => expect(entityResource.result.current.hasValue).toBe(true));
    await waitFor(() => expect(countResource.result.current.hasValue).toBe(true));

    expect(arrayResource.result.current.isEmpty).toBe(true);
    expect(entityResource.result.current.isEmpty).toBe(true);
    expect(countResource.result.current.isEmpty).toBe(false);
  });

  // 重置动作放在 passive effect（还额外套了 queueMicrotask）里，React 会先提交并**绘制**
  // 一帧「isLoading:false + 旧数据」——切 tab/filter 后用户真实看到「新条件下已加载完成、
  // 共 N 条」，而 N 条是旧条件的数据。Angular 在 effect 内同步置位，Vue 在 watch 内同步置位。
  it('flips to loading in the same render pass when options change', async () => {
    const first = new Subject<TestEntity[]>();
    const second = new Subject<TestEntity[]>();
    queryMocks.find.mockImplementation(options => (options.key === 'first' ? first : second));

    const { rerender, result } = renderHook(({ key }: { key: string }) => useFind(TestEntity, { key }), {
      initialProps: { key: 'first' }
    });

    await waitFor(() => expect(queryMocks.find).toHaveBeenCalledTimes(1));
    await act(async () => {
      first.next([new TestEntity('a')]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasValue).toBe(true);

    rerender({ key: 'second' });

    // 不 await：这一帧就是浏览器会绘制的那一帧
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasValue).toBe(false);
  });

  it('keeps the previous value while only the options change', async () => {
    const first = new Subject<TestEntity[]>();
    const second = new Subject<TestEntity[]>();
    queryMocks.find.mockImplementation(options => (options.key === 'first' ? first : second));

    const { rerender, result } = renderHook(({ key }: { key: string }) => useFind(TestEntity, { key }), {
      initialProps: { key: 'first' }
    });

    await waitFor(() => expect(queryMocks.find).toHaveBeenCalledTimes(1));
    await act(async () => {
      first.next([new TestEntity('kept')]);
    });

    rerender({ key: 'second' });

    // 同实体同方法、仅选项变化 → stale-while-loading（README 明示的语义）
    expect(result.current.value).toHaveLength(1);
    expect(result.current.value[0]?.id).toBe('kept');
  });

  // 依赖数组里还有 EntityType/method，这两者变化时 value 的**运行期类型**也变了；
  // 保留旧值等于让 `InstanceType<T>[]` 声明与实际内容不符，消费方按新实体的字段访问会拿到 undefined。
  it('drops the stale value when the method changes', async () => {
    const findStream = new Subject<TestEntity[]>();
    const allStream = new Subject<TestEntity[]>();
    queryMocks.find.mockReturnValue(findStream);
    queryMocks.findAll.mockReturnValue(allStream);

    const { rerender, result } = renderHook(
      ({ mode }: { mode: 'find' | 'findAll' }) =>
        mode === 'find' ? useFind(TestEntity, { key: 'k' }) : useFindAll(TestEntity, { key: 'k' }),
      { initialProps: { mode: 'find' } as { mode: 'find' | 'findAll' } }
    );

    await waitFor(() => expect(queryMocks.find).toHaveBeenCalledTimes(1));
    await act(async () => {
      findStream.next([new TestEntity('stale')]);
    });
    expect(result.current.value).toHaveLength(1);

    rerender({ mode: 'findAll' });

    expect(result.current.value).toEqual([]);
    expect(result.current.hasValue).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });
});

describe('named repository hooks', () => {
  it('dispatches every public hook to its matching repository method', async () => {
    const options: QueryOptions = { key: 'all' };
    const cursorOptions: CursorOptions = { key: 'cursor', limit: 10 };
    const resources = [
      renderHook(() => useGet(TestEntity, options)),
      renderHook(() => useFindOne(TestEntity, options)),
      renderHook(() => useFindOneOrFail(TestEntity, options)),
      renderHook(() => useFind(TestEntity, options)),
      renderHook(() => useFindByCursor(TestEntity, cursorOptions)),
      renderHook(() => useFindAll(TestEntity, options)),
      renderHook(() => useCount(TestEntity, options)),
      renderHook(() => useFindDescendants(TestEntity, options)),
      renderHook(() => useCountDescendants(TestEntity, options)),
      renderHook(() => useFindAncestors(TestEntity, options)),
      renderHook(() => useCountAncestors(TestEntity, options)),
      renderHook(() => useGraphNeighbors(TestEntity, options)),
      renderHook(() => useCountNeighbors(TestEntity, options)),
      renderHook(() => useGraphPaths(TestEntity, options))
    ];

    await waitFor(() => expect(resources.every(resource => resource.result.current.hasValue)).toBe(true));

    expect(queryMocks.get).toHaveBeenCalledWith(options);
    expect(queryMocks.findOne).toHaveBeenCalledWith(options);
    expect(queryMocks.findOneOrFail).toHaveBeenCalledWith(options);
    expect(queryMocks.find).toHaveBeenCalledWith(options);
    expect(queryMocks.findByCursor).toHaveBeenCalledWith(cursorOptions);
    expect(queryMocks.findAll).toHaveBeenCalledWith(options);
    expect(queryMocks.count).toHaveBeenCalledWith(options);
    expect(queryMocks.findDescendants).toHaveBeenCalledWith(options);
    expect(queryMocks.countDescendants).toHaveBeenCalledWith(options);
    expect(queryMocks.findAncestors).toHaveBeenCalledWith(options);
    expect(queryMocks.countAncestors).toHaveBeenCalledWith(options);
    expect(queryMocks.findNeighbors$).toHaveBeenCalledWith(options);
    expect(queryMocks.countNeighbors$).toHaveBeenCalledWith(options);
    expect(queryMocks.findPaths$).toHaveBeenCalledWith(options);
  });

  it('preserves graph result structures and truncated state', async () => {
    const neighbors = createGraphQueryResult(
      [
        {
          node: new TestEntity('neighbor'),
          edge: { sourceId: 'source', targetId: 'neighbor', direction: 'out' as const },
          level: 1
        }
      ],
      true
    );
    const paths = createGraphQueryResult(
      [
        {
          nodes: [new TestEntity('from'), new TestEntity('to')],
          edges: [{ sourceId: 'from', targetId: 'to' }],
          length: 1
        }
      ],
      true
    );
    queryMocks.findNeighbors$.mockReturnValue(of(neighbors));
    queryMocks.findPaths$.mockReturnValue(of(paths));

    const neighborResource = renderHook(() => useGraphNeighbors(TestEntity, { key: 'neighbors' }));
    const pathResource = renderHook(() => useGraphPaths(TestEntity, { key: 'paths' }));

    await waitFor(() => expect(neighborResource.result.current.hasValue).toBe(true));
    await waitFor(() => expect(pathResource.result.current.hasValue).toBe(true));
    expect(neighborResource.result.current.value.truncated).toBe(true);
    expect(neighborResource.result.current.value[0]?.node.id).toBe('neighbor');
    expect(pathResource.result.current.value.truncated).toBe(true);
    expect(pathResource.result.current.value[0]?.nodes.map(node => node.id)).toEqual(['from', 'to']);
  });
});

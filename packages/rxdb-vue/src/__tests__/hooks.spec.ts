import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import {
  createGraphQueryResult,
  type GraphPath,
  type GraphQueryResult,
  type NeighborResult
} from '@aiao/rxdb-plugin-graph';
import { mount } from '@vue/test-utils';
import { EMPTY, Observable, Subject, of, throwError, type Observer, type Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  defineComponent,
  effectScope,
  h,
  isReactive,
  nextTick,
  reactive,
  ref,
  toRefs,
  type EffectScope
} from 'vue';
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
  useGraphPaths,
  type RxDBResource
} from '../hooks';

type QueryMode = 'value' | 'empty' | 'error' | 'throw' | 'complete';

interface QueryOptions {
  key: string;
  mode?: QueryMode;
  /** 内建容器字段：朴素 normalize 会把它们坍缩成 `{}`，内容变化就此测不出来。 */
  since?: Date;
  tags?: Set<string>;
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

type GetObserver = Pick<Observer<TestEntity | undefined>, 'next' | 'error' | 'complete'>;

const createGetBoundaryObservable = (
  subscribe: (observer: GetObserver) => Subscription
): Observable<TestEntity | undefined> => ({ subscribe }) as unknown as Observable<TestEntity | undefined>;

const activeScopes: EffectScope[] = [];
const mountedWrappers: Array<{ unmount: () => void }> = [];

const inScope = <T>(factory: () => T): T => {
  const scope = effectScope();
  activeScopes.push(scope);
  const result = scope.run(factory);
  if (result === undefined) {
    throw new Error('Effect scope did not return a resource');
  }
  return result;
};

const flushWatchers = async (): Promise<void> => {
  await nextTick();
  await Promise.resolve();
};

const resetQueryMocks = (): void => {
  for (const mock of Object.values(queryMocks)) {
    mock.mockReset();
  }

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

describe('RxDB Vue repository hooks', () => {
  beforeEach(() => {
    resetQueryMocks();
  });

  afterEach(() => {
    while (activeScopes.length > 0) {
      activeScopes.pop()?.stop();
    }
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
    vi.restoreAllMocks();
  });

  it('uses the real Vue effect scope and exposes a successful single-value resource', () => {
    const entity = new TestEntity('one');
    queryMocks.get.mockReturnValue(of(entity));

    const resource = inScope(() => useGet(TestEntity, { key: 'one' }));

    expect(queryMocks.get).toHaveBeenCalledWith({ key: 'one' });
    expect(resource).toMatchObject({
      value: entity,
      error: undefined,
      isLoading: false,
      isEmpty: false,
      hasValue: true
    });
    expect(isReactive(resource.value)).toBe(false);
  });

  it('reacts to ref options and reports an empty array consistently', async () => {
    const options = ref<QueryOptions>({ key: 'filled' });
    queryMocks.find.mockImplementation(current => of(current.key === 'filled' ? [new TestEntity('filled')] : []));
    const resource = inScope(() => useFind(TestEntity, options));

    expect(resource.value).toHaveLength(1);
    options.value = { key: 'empty' };
    await flushWatchers();

    expect(queryMocks.find).toHaveBeenLastCalledWith({ key: 'empty' });
    expect(resource.value).toEqual([]);
    expect(resource).toMatchObject({ isLoading: false, isEmpty: true, hasValue: true, error: undefined });
  });

  it('tracks dependencies read by function options', async () => {
    const key = ref('first');
    queryMocks.count.mockImplementation(options => of(options.key === 'first' ? 1 : 2));
    const resource = inScope(() => useCount(TestEntity, () => ({ key: key.value })));

    expect(resource.value).toBe(1);
    key.value = 'second';
    await flushWatchers();

    expect(resource.value).toBe(2);
    expect(queryMocks.count).toHaveBeenCalledTimes(2);
  });

  it('invalidates stale value metadata when an observable errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const options = ref<QueryOptions>({ key: 'value' });
    const entity = new TestEntity('stale');
    queryMocks.findOne.mockImplementation(current =>
      current.mode === 'error' ? throwError(() => 'query failed') : of(entity)
    );
    const resource = inScope(() => useFindOne(TestEntity, options));

    expect(resource).toMatchObject({ value: entity, hasValue: true, isEmpty: false });
    options.value = { key: 'error', mode: 'error' };
    await flushWatchers();

    expect(resource.value).toBe(entity);
    expect(resource.error).toEqual(new Error('query failed'));
    expect(resource.hasValue).toBe(false);
    expect(resource.isEmpty).toBeUndefined();
    expect(resource.isLoading).toBe(false);
  });

  it('normalizes synchronous query failures and resets stale metadata', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const options = ref<QueryOptions>({ key: 'value' });
    queryMocks.get.mockImplementation(current => {
      if (current.mode === 'throw') {
        throw 'synchronous failure';
      }
      return of(new TestEntity(current.key));
    });
    const resource = inScope(() => useGet(TestEntity, options));

    options.value = { key: 'throw', mode: 'throw' };
    await flushWatchers();

    expect(resource.error).toEqual(new Error('synchronous failure'));
    expect(resource.hasValue).toBe(false);
    expect(resource.isEmpty).toBeUndefined();
    expect(resource.isLoading).toBe(false);
  });

  it('finishes loading when a query completes without emitting', () => {
    queryMocks.get.mockReturnValue(EMPTY);

    const resource = inScope(() => useGet(TestEntity, { key: 'complete', mode: 'complete' }));

    expect(resource).toMatchObject({
      value: undefined,
      error: undefined,
      isLoading: false,
      isEmpty: undefined,
      hasValue: false
    });
  });

  it('reports a missing repository method without fabricating a value', async () => {
    const resource = inScope(() => useGet(MissingGetEntity, { key: 'missing' }));
    await flushWatchers();

    expect(resource.error?.message).toBe('Method "get" not found on EntityType');
    expect(resource).toMatchObject({ isLoading: false, isEmpty: undefined, hasValue: false });
  });

  it('cancels the previous query when reactive options change', async () => {
    const first = new Subject<TestEntity | undefined>();
    const second = new Subject<TestEntity | undefined>();
    const options = ref<QueryOptions>({ key: 'first' });
    queryMocks.get.mockImplementation(current => (current.key === 'first' ? first : second));
    const resource = inScope(() => useGet(TestEntity, options));

    expect(first.observed).toBe(true);
    options.value = { key: 'second' };
    await flushWatchers();

    expect(first.observed).toBe(false);
    expect(second.observed).toBe(true);
    second.next(new TestEntity('second'));
    expect(resource.value?.id).toBe('second');
  });

  it('ignores late callbacks from superseded queries', async () => {
    const options = ref<QueryOptions>({ key: 'first' });
    const observers = new Map<string, GetObserver>();
    queryMocks.get.mockImplementation(current =>
      createGetBoundaryObservable(observer => {
        observers.set(current.key, observer);
        return { closed: false, unsubscribe: vi.fn() } as unknown as Subscription;
      })
    );
    const resource = inScope(() => useGet(TestEntity, options));
    const firstObserver = observers.get('first');
    if (!firstObserver) throw new Error('First query observer was not captured');

    options.value = { key: 'second' };
    await flushWatchers();
    firstObserver.next(new TestEntity('stale'));
    firstObserver.error(new Error('stale error'));

    expect(resource).toMatchObject({
      value: undefined,
      error: undefined,
      isLoading: true,
      isEmpty: undefined,
      hasValue: false
    });

    const secondObserver = observers.get('second');
    if (!secondObserver) throw new Error('Second query observer was not captured');
    options.value = { key: 'third' };
    await flushWatchers();
    secondObserver.complete();

    expect(resource.isLoading).toBe(true);
    const thirdObserver = observers.get('third');
    if (!thirdObserver) throw new Error('Third query observer was not captured');
    thirdObserver.next(new TestEntity('third'));
    expect(resource.value?.id).toBe('third');
    expect(resource.isLoading).toBe(false);
  });

  it('unsubscribes an active query when its Vue scope is disposed', () => {
    const teardown = vi.fn();
    queryMocks.get.mockReturnValue(new Observable(() => teardown));
    const scope = effectScope();
    const resource = scope.run(() => useGet(TestEntity, { key: 'active' }));

    expect(resource?.isLoading).toBe(true);
    scope.stop();

    expect(teardown).toHaveBeenCalledOnce();
  });

  it('treats an undefined single result as an empty value that was received', () => {
    queryMocks.findOne.mockReturnValue(of(undefined));

    const resource = inScope(() => useFindOne(TestEntity, { key: 'none' }));

    expect(resource).toMatchObject({
      value: undefined,
      isLoading: false,
      isEmpty: true,
      hasValue: true,
      error: undefined
    });
  });

  it('delegates every public query wrapper to its matching static repository method', () => {
    const resources = inScope(() => ({
      findOneOrFail: useFindOneOrFail(TestEntity, { key: 'find-one-or-fail' }),
      findByCursor: useFindByCursor(TestEntity, { key: 'cursor', limit: 10 }),
      findAll: useFindAll(TestEntity, { key: 'find-all' }),
      descendants: useFindDescendants(TestEntity, { key: 'descendants' }),
      descendantCount: useCountDescendants(TestEntity, { key: 'descendant-count' }),
      ancestors: useFindAncestors(TestEntity, { key: 'ancestors' }),
      ancestorCount: useCountAncestors(TestEntity, { key: 'ancestor-count' }),
      neighbors: useGraphNeighbors(TestEntity, { key: 'neighbors' }),
      neighborCount: useCountNeighbors(TestEntity, { key: 'neighbor-count' }),
      paths: useGraphPaths(TestEntity, { key: 'paths' })
    }));

    expect(resources.findOneOrFail.value?.id).toBe('find-one-or-fail');
    expect(resources.findByCursor.value[0]?.id).toBe('cursor');
    expect(resources.findAll.value[0]?.id).toBe('find-all');
    expect(resources.descendants.value[0]?.id).toBe('descendant');
    expect(resources.descendantCount.value).toBe(2);
    expect(resources.ancestors.value[0]?.id).toBe('ancestor');
    expect(resources.ancestorCount.value).toBe(1);
    expect(resources.neighbors.value[0]?.node.id).toBe('neighbor');
    expect(resources.neighborCount.value).toBe(3);
    expect(resources.paths.value).toHaveLength(1);
    expect(queryMocks.findOneOrFail).toHaveBeenCalledOnce();
    expect(queryMocks.findByCursor).toHaveBeenCalledOnce();
    expect(queryMocks.findAll).toHaveBeenCalledOnce();
    expect(queryMocks.findDescendants).toHaveBeenCalledOnce();
    expect(queryMocks.countDescendants).toHaveBeenCalledOnce();
    expect(queryMocks.findAncestors).toHaveBeenCalledOnce();
    expect(queryMocks.countAncestors).toHaveBeenCalledOnce();
    expect(queryMocks.findNeighbors$).toHaveBeenCalledOnce();
    expect(queryMocks.countNeighbors$).toHaveBeenCalledOnce();
    expect(queryMocks.findPaths$).toHaveBeenCalledOnce();
  });

  it('保留图结果结构与 truncated 状态', () => {
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

    const resources = inScope(() => ({
      neighbors: useGraphNeighbors(TestEntity, { key: 'neighbors' }),
      paths: useGraphPaths(TestEntity, { key: 'paths' })
    }));

    expect(resources.neighbors.value.truncated).toBe(true);
    expect(resources.neighbors.value[0]?.node.id).toBe('neighbor');
    expect(resources.paths.value.truncated).toBe(true);
    expect(resources.paths.value[0]?.nodes.map(node => node.id)).toEqual(['from', 'to']);
  });

  // RVU-002：watch 的第三个源原先只是 `getOptionsValue`，一个字段都不读；
  // Vue 对函数型 source 不做 traverse，于是「原地改字段」identity 不变 → 回调不触发 → 永远查不出新数据，
  // 而「换成结构相同的新引用」identity 变了 → 无谓退订重订阅。
  // 订阅切换现在按领域级内容 key 决定（与 useInfiniteScroll、React 共用同一实现）。
  describe('选项按内容而非引用触发重查（RVU-002）', () => {
    it('reactive 选项原地改字段会重查', async () => {
      const options = reactive<QueryOptions>({ key: 'first' });
      queryMocks.find.mockImplementation(current => of([new TestEntity(current.key)]));
      const resource = inScope(() => useFind(TestEntity, options));

      expect(resource.value[0]?.id).toBe('first');
      options.key = 'second';
      await flushWatchers();

      expect(queryMocks.find).toHaveBeenCalledTimes(2);
      expect(resource.value[0]?.id).toBe('second');
    });

    it('ref 内层字段原地改动会重查', async () => {
      const options = ref<QueryOptions>({ key: 'first' });
      queryMocks.count.mockImplementation(current => of(current.key === 'first' ? 1 : 2));
      const resource = inScope(() => useCount(TestEntity, options));

      options.value.key = 'second';
      await flushWatchers();

      expect(queryMocks.count).toHaveBeenCalledTimes(2);
      expect(resource.value).toBe(2);
    });

    it('computed 选项的内容变化会重查', async () => {
      const key = ref('first');
      const options = computed<QueryOptions>(() => ({ key: key.value }));
      queryMocks.find.mockImplementation(current => of([new TestEntity(current.key)]));
      const resource = inScope(() => useFind(TestEntity, options));

      key.value = 'second';
      await flushWatchers();

      expect(resource.value[0]?.id).toBe('second');
    });

    it('结构等价的新引用不重订阅', async () => {
      const first = new Subject<TestEntity[]>();
      const options = ref<QueryOptions>({ key: 'same', mode: 'value' });
      queryMocks.find.mockReturnValue(first);
      inScope(() => useFind(TestEntity, options));

      options.value = { mode: 'value', key: 'same' };
      await flushWatchers();

      expect(queryMocks.find).toHaveBeenCalledOnce();
      // 旧订阅原样活着：重订阅会丢掉活查询已推送的增量
      expect(first.observed).toBe(true);
    });

    it.each([
      [
        'Date',
        { key: 'k', since: new Date('2026-01-01T00:00:00.000Z') },
        { key: 'k', since: new Date('2026-07-01T00:00:00.000Z') }
      ],
      ['Set', { key: 'k', tags: new Set(['a']) }, { key: 'k', tags: new Set(['a', 'b']) }]
    ])('%s 字段的内容变化会重查', async (_name, before, after) => {
      const options = ref<QueryOptions>(before);
      queryMocks.find.mockReturnValue(of([new TestEntity('page')]));
      inScope(() => useFind(TestEntity, options));

      options.value = after;
      await flushWatchers();

      expect(queryMocks.find).toHaveBeenCalledTimes(2);
    });

    // 与 useInfiniteScroll 同款：游标身份 = orderBy 字段取值，实体原型不再被当成非法宿主对象
    it('游标实体做 after 时按游标身份重查', async () => {
      const options = ref<CursorOptions>({ key: 'cursor', after: new TestEntity('c1') });
      queryMocks.findByCursor.mockImplementation(current => of([new TestEntity(current.after?.id ?? 'none')]));
      const resource = inScope(() => useFindByCursor(TestEntity, options));

      expect(resource.value[0]?.id).toBe('c1');

      // 同一条游标的新实例：orderBy 缺省 ⇒ 身份就是主键 id，不构成新游标
      options.value = { key: 'cursor', after: new TestEntity('c1', '改了名字') };
      await flushWatchers();
      expect(queryMocks.findByCursor).toHaveBeenCalledOnce();

      options.value = { key: 'cursor', after: new TestEntity('c2') };
      await flushWatchers();
      expect(queryMocks.findByCursor).toHaveBeenCalledTimes(2);
      expect(resource.value[0]?.id).toBe('c2');
    });

    it('选项含不可序列化字段时报错，而不是静默算出同一个 key', () => {
      const options = { key: 'bad', mode: (() => 'value') as unknown as QueryMode };

      expect(() => inScope(() => useFind(TestEntity, options))).toThrow(
        /RxDB query options must contain serializable values/
      );
    });
  });

  // RVU-003：新一轮查询原先只重置 error，hasValue/isEmpty 留着上一轮的；
  // 再叠加「complete 只把 isLoading 置 false」，一次没有 next 的重查询就会稳定在
  // 「旧实体 + hasValue:true + isEmpty:false + isLoading:false」——
  // 等于宣称旧值是新条件下的成功结果。Angular（effect 入口）与 React（渲染期同步复位）
  // 都在新请求入口复位元数据，这里锁的是同一条三端契约。
  describe('新请求入口复位元数据（RVU-003）', () => {
    const modeQuery = (entity: TestEntity) => (current: QueryOptions) => {
      if (current.mode === 'empty') return EMPTY;
      if (current.mode === 'error') return throwError(() => 'query failed');
      return of(entity);
    };

    it('重查询无 next 就 complete 时，不再宣称旧值属于新条件', async () => {
      const stale = new TestEntity('stale');
      const options = ref<QueryOptions>({ key: 'value' });
      queryMocks.findOne.mockImplementation(modeQuery(stale));
      const resource = inScope(() => useFindOne(TestEntity, options));

      expect(resource).toMatchObject({ value: stale, hasValue: true, isEmpty: false });

      options.value = { key: 'empty', mode: 'empty' };
      await flushWatchers();

      // 旧值仍可见（README 明示的 stale-while-revalidate），但元数据必须收敛成无值态
      expect(resource.value).toBe(stale);
      expect(resource).toMatchObject({ hasValue: false, isEmpty: undefined, isLoading: false, error: undefined });
    });

    it('等待期间保持 loading 且不再自称有值', async () => {
      const stale = new TestEntity('stale');
      const pending = new Subject<TestEntity | undefined>();
      const options = ref<QueryOptions>({ key: 'value' });
      queryMocks.findOne.mockImplementation(current => (current.key === 'value' ? of(stale) : pending));
      const resource = inScope(() => useFindOne(TestEntity, options));

      options.value = { key: 'pending' };
      await flushWatchers();

      expect(resource.value).toBe(stale);
      expect(resource).toMatchObject({ isLoading: true, hasValue: false, isEmpty: undefined });

      pending.next(undefined);
      expect(resource).toMatchObject({ value: undefined, isLoading: false, hasValue: true, isEmpty: true });
    });

    it('连续重查询的状态序列不残留上一轮结论', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const entity = new TestEntity('one');
      const options = ref<QueryOptions>({ key: 'value' });
      queryMocks.findOne.mockImplementation(modeQuery(entity));
      const resource = inScope(() => useFindOne(TestEntity, options));

      options.value = { key: 'error', mode: 'error' };
      await flushWatchers();
      expect(resource).toMatchObject({ hasValue: false, isEmpty: undefined, isLoading: false });
      expect(resource.error).toEqual(new Error('query failed'));

      options.value = { key: 'empty', mode: 'empty' };
      await flushWatchers();
      // 上一轮的 error 也必须随新请求清掉，否则失败会粘在无关的新条件上
      expect(resource).toMatchObject({ hasValue: false, isEmpty: undefined, isLoading: false, error: undefined });

      options.value = { key: 'value' };
      await flushWatchers();
      expect(resource).toMatchObject({ value: entity, hasValue: true, isEmpty: false, isLoading: false });
    });
  });

  // RVU-008：基础 hooks 返回的是深 reactive 对象而非一组 Ref，
  // `const { value } = useGet(...)` 只是一次性读值 —— 而 TSDoc 的 @example 正在演示这种写法。
  // 同包 useInfiniteScroll 返回的却是 ComputedRef、解构安全，一个包里两种相反契约。
  // 契约就此锁定：整体持有或经 toRefs 解构；验证必须看模板是否真的重渲染。
  describe('reactive 资源的解构契约（RVU-008）', () => {
    const mountWithLateValue = (render: (resource: RxDBResource<TestEntity | undefined>) => () => unknown) => {
      const subject = new Subject<TestEntity | undefined>();
      queryMocks.get.mockReturnValue(subject.asObservable());

      const wrapper = mount(
        defineComponent({
          setup() {
            const resource = useGet(TestEntity, { key: 'destructure' });
            return render(resource);
          }
        })
      );
      mountedWrappers.push(wrapper);

      return { subject, wrapper };
    };

    it('整体持有时模板会随后续 emission 重渲染', async () => {
      const { subject, wrapper } = mountWithLateValue(resource => () => h('span', resource.value?.name ?? 'pending'));

      expect(wrapper.text()).toBe('pending');

      subject.next(new TestEntity('late', '迟到的值'));
      await nextTick();

      expect(wrapper.text()).toBe('迟到的值');
    });

    it('toRefs 解构后模板同样会重渲染', async () => {
      const { subject, wrapper } = mountWithLateValue(resource => {
        const { value } = toRefs(resource);
        return () => h('span', value.value?.name ?? 'pending');
      });

      expect(wrapper.text()).toBe('pending');

      subject.next(new TestEntity('late', 'toRefs 的值'));
      await nextTick();

      expect(wrapper.text()).toBe('toRefs 的值');
    });

    it('直接解构只拿到一次性快照，模板不再更新', async () => {
      const { subject, wrapper } = mountWithLateValue(resource => {
        // 这正是被删掉的 @example 所演示的写法
        const { value } = resource;
        return () => h('span', value?.name ?? 'pending');
      });

      subject.next(new TestEntity('late', '永远看不到'));
      await nextTick();

      expect(wrapper.text()).toBe('pending');
    });
  });

  it('MUST NOT subscribe during SSR (no window) and MUST leave isLoading true', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    try {
      const ssrHooks = await import('../hooks.js');
      const resource = inScope(() => ssrHooks.useGet(TestEntity, { key: 'ssr' }));

      expect(queryMocks.get).not.toHaveBeenCalled();
      expect(resource).toMatchObject({
        value: undefined,
        error: undefined,
        isLoading: true,
        isEmpty: undefined,
        hasValue: false
      });
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

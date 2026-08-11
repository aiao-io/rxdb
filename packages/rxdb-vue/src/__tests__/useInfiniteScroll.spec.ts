import { ENTITY_STATIC_TYPES, type EntityType, type RxDB } from '@aiao/rxdb';
import { mount } from '@vue/test-utils';
import { BehaviorSubject, Observable, Subject, map, of, throwError, type Observer, type Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReactive, nextTick, ref, shallowRef, type ComputedRef, type Ref } from 'vue';
import { useInfiniteScroll, type InfiniteScrollResource } from '../useInfiniteScroll';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

interface CursorOptions {
  where: Record<string, string | { $gt: Date }>;
  orderBy: Array<{ field: string; sort: 'asc' | 'desc' }>;
  limit?: number;
  after?: ScrollEntity;
  before?: ScrollEntity;
}

interface ScrollEntityStaticTypes {
  findByCursorOptions: CursorOptions;
}

class ScrollEntity {
  static [ENTITY_STATIC_TYPES]: ScrollEntityStaticTypes = {
    findByCursorOptions: {
      where: {},
      orderBy: []
    }
  };

  constructor(
    readonly id = 'entity',
    readonly name = 'Entity',
    readonly sort = 0
  ) {}
}

type FindByCursorMock = ReturnType<typeof vi.fn<(options: CursorOptions) => Observable<ScrollEntity[]>>>;
type GetRepositoryMock = ReturnType<
  typeof vi.fn<(entityType: typeof ScrollEntity) => { findByCursor: FindByCursorMock }>
>;

interface DatabaseHarness {
  database: RxDB;
  findByCursor: FindByCursorMock;
  getRepository: GetRepositoryMock;
}

type CursorOptionsInput = CursorOptions | (() => CursorOptions) | Ref<CursorOptions> | ComputedRef<CursorOptions>;
type CursorObserver = Pick<Observer<ScrollEntity[]>, 'next' | 'error' | 'complete'>;

const wrappers: Array<{ unmount: () => void }> = [];

const createOptions = (status = 'active', limit?: number): CursorOptions => ({
  where: { status },
  orderBy: [{ field: 'id', sort: 'asc' }],
  ...(limit === undefined ? {} : { limit })
});

const createDatabase = (): DatabaseHarness => {
  const findByCursor = vi.fn<(options: CursorOptions) => Observable<ScrollEntity[]>>();
  const getRepository = vi.fn<(entityType: typeof ScrollEntity) => { findByCursor: FindByCursorMock }>(() => ({
    findByCursor
  }));
  const database = {
    entityManager: { getRepository }
  } as unknown as RxDB;
  return { database, findByCursor, getRepository };
};

const createBoundaryObservable = (subscribe: (observer: CursorObserver) => Subscription): Observable<ScrollEntity[]> =>
  ({ subscribe }) as unknown as Observable<ScrollEntity[]>;

const mountResource = (
  database: RxDB | Ref<RxDB | undefined> | undefined,
  options: CursorOptionsInput,
  duringSetup?: (resource: InfiniteScrollResource<ScrollEntity>) => void
) => {
  const exposed: { resource?: InfiniteScrollResource<ScrollEntity> } = {};
  const Consumer = createSetupHarness(() => {
    exposed.resource = useInfiniteScroll(ScrollEntity, options);
    duringSetup?.(exposed.resource);
  });
  const wrapper = mount(createRxDBProviderHarness(database, Consumer));
  wrappers.push(wrapper);

  if (!exposed.resource) {
    wrapper.unmount();
    throw new Error('Consumer setup did not expose the infinite-scroll resource');
  }

  return { resource: exposed.resource, wrapper };
};

const flushWatchers = async (): Promise<void> => {
  await nextTick();
  await Promise.resolve();
};

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
  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    vi.restoreAllMocks();
  });

  it('gates manual setup calls until the real Vue mounted lifecycle runs', () => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(of([new ScrollEntity('mounted')]));
    let callsDuringSetup = -1;

    const { resource } = mountResource(database.database, createOptions('mounted', 2), current => {
      current.loadMore();
      callsDuringSetup = database.findByCursor.mock.calls.length;
      expect(current.isEmpty.value).toBe(false);
    });

    expect(callsDuringSetup).toBe(0);
    expect(database.findByCursor).toHaveBeenCalledOnce();
    expect(resource.value.value.map(entity => entity.id)).toEqual(['mounted']);
  });

  it('loads the first page, marks entities raw, and derives empty and has-more state', () => {
    const database = createDatabase();
    const page = [new ScrollEntity('one'), new ScrollEntity('two')];
    const options = createOptions('first', 3);
    database.findByCursor.mockReturnValue(of(page));

    const { resource } = mountResource(database.database, options);

    expect(database.getRepository).toHaveBeenCalledWith(ScrollEntity);
    expect(database.findByCursor).toHaveBeenCalledWith(options);
    expect(resource.value.value).toEqual(page);
    expect(resource.isLoading.value).toBe(false);
    expect(resource.isEmpty.value).toBe(false);
    expect(resource.hasMore.value).toBe(false);
    expect(resource.error.value).toBeUndefined();
    expect(isReactive(resource.value.value[0])).toBe(false);
  });

  it('appends cursor pages and sends the last entity as the next after cursor', () => {
    const database = createDatabase();
    const firstPage = [new ScrollEntity('one'), new ScrollEntity('two')];
    const secondPage = [new ScrollEntity('three')];
    database.findByCursor.mockReturnValueOnce(of(firstPage)).mockReturnValueOnce(of(secondPage));

    const { resource } = mountResource(database.database, createOptions('cursor', 2));
    resource.loadMore();

    expect(database.findByCursor).toHaveBeenCalledTimes(2);
    expect(database.findByCursor.mock.calls[1]?.[0].after).toBe(firstPage[1]);
    expect(resource.value.value.map(entity => entity.id)).toEqual(['one', 'two', 'three']);
    expect(resource.hasMore.value).toBe(false);
  });

  it('does not overlap requests while the current page is still loading', () => {
    const database = createDatabase();
    const firstPage = new Subject<ScrollEntity[]>();
    database.findByCursor.mockReturnValue(firstPage);

    const { resource } = mountResource(database.database, createOptions('loading', 1));
    expect(resource.isLoading.value).toBe(true);

    resource.loadMore();
    expect(database.findByCursor).toHaveBeenCalledOnce();

    firstPage.next([new ScrollEntity('one')]);
    database.findByCursor.mockReturnValue(of([]));
    resource.loadMore();
    expect(database.findByCursor).toHaveBeenCalledTimes(2);
  });

  // 首页每次重发都保持**同一条尾条目**（只改 name），页边界不动 —— 这样断言的才是
  // 「最新一页对 isLoading/hasMore 有唯一话语权」，而不是顺带把 RVU-004 的错误行为焊死。
  // 原用例每次重发都换掉尾条目的 id（first → first-updated → first-final），
  // 那是边界移动，正确行为是重锚第二页；断言 findByCursor 恰好 2 次即是在锁定缺陷。
  // 边界移动本身由 `live cursor boundary (RVU-004)` 用例组覆盖。
  it('keeps the newest page loading and authoritative while an earlier live page re-emits', () => {
    const database = createDatabase();
    const firstPage = new Subject<ScrollEntity[]>();
    const secondPage = new Subject<ScrollEntity[]>();
    database.findByCursor.mockReturnValueOnce(firstPage).mockReturnValueOnce(secondPage);

    const { resource } = mountResource(database.database, createOptions('live-race', 1));
    firstPage.next([new ScrollEntity('first', 'First')]);
    resource.loadMore();

    firstPage.next([new ScrollEntity('first', 'First updated')]);
    expect(resource.isLoading.value).toBe(true);

    secondPage.next([]);
    expect(resource.isLoading.value).toBe(false);
    expect(resource.hasMore.value).toBe(false);

    firstPage.next([new ScrollEntity('first', 'First final')]);
    firstPage.complete();
    resource.loadMore();

    expect(resource.value.value.map(entity => entity.name)).toEqual(['First final']);
    expect(resource.hasMore.value).toBe(false);
    expect(database.findByCursor).toHaveBeenCalledTimes(2);
  });

  it('stops requesting after a short page and reports a loaded empty result', () => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(of([]));

    const { resource } = mountResource(database.database, createOptions('empty', 10));
    resource.loadMore();

    expect(database.findByCursor).toHaveBeenCalledOnce();
    expect(resource.value.value).toEqual([]);
    expect(resource.isEmpty.value).toBe(true);
    expect(resource.hasMore.value).toBe(false);
  });

  it('refreshes from page one and cancels live subscriptions from previous pages', () => {
    const database = createDatabase();
    const first = new BehaviorSubject([new ScrollEntity('old')]);
    const refreshed = new Subject<ScrollEntity[]>();
    database.findByCursor.mockReturnValueOnce(first).mockReturnValueOnce(refreshed);

    const { resource } = mountResource(database.database, createOptions('refresh', 1));
    resource.refresh();

    expect(first.observed).toBe(false);
    expect(resource.value.value).toEqual([]);
    expect(resource.isLoading.value).toBe(true);
    expect(resource.hasMore.value).toBe(true);

    refreshed.next([new ScrollEntity('new')]);
    expect(resource.value.value.map(entity => entity.id)).toEqual(['new']);
    expect(resource.error.value).toBeUndefined();
  });

  it('keeps each active page live until it completes or the component is destroyed', () => {
    const database = createDatabase();
    const livePage = new BehaviorSubject([new ScrollEntity('initial')]);
    database.findByCursor.mockReturnValue(livePage);

    const { resource, wrapper } = mountResource(database.database, createOptions('live', 2));
    livePage.next([new ScrollEntity('updated'), new ScrollEntity('added')]);

    expect(resource.value.value.map(entity => entity.id)).toEqual(['updated', 'added']);
    wrapper.unmount();
    expect(livePage.observed).toBe(false);
  });

  it('reloads on the first semantic ref-options change and ignores key-order-only changes', async () => {
    const database = createDatabase();
    const options = shallowRef<CursorOptions>({
      where: { a: '1', b: '2' },
      orderBy: [{ field: 'id', sort: 'asc' }],
      limit: 2
    });
    database.findByCursor.mockImplementation(current => of([new ScrollEntity(String(current.where.a ?? 'missing'))]));
    const { resource } = mountResource(database.database, options);

    options.value = {
      where: { b: '2', a: '1' },
      orderBy: [{ sort: 'asc', field: 'id' }],
      limit: 2
    };
    await flushWatchers();
    expect(database.findByCursor).toHaveBeenCalledOnce();

    options.value = {
      where: { a: 'changed', b: '2' },
      orderBy: [{ field: 'id', sort: 'asc' }],
      limit: 2
    };
    await flushWatchers();

    expect(database.findByCursor).toHaveBeenCalledTimes(2);
    expect(resource.value.value[0]?.id).toBe('changed');
  });

  // Date 的自有可枚举键为空，朴素 normalize 会把任何 Date 归一化成 {}：
  // 用户把日期筛选从 1 月改到 7 月，optionsKey 不变 → watch 不触发 → 列表静默停在旧数据。
  it('reloads when only a Date inside the options changes', async () => {
    const database = createDatabase();
    const options = shallowRef<CursorOptions>({
      where: { createdAt: { $gt: new Date('2026-01-01T00:00:00.000Z') } },
      orderBy: [{ field: 'id', sort: 'asc' }],
      limit: 2
    });
    database.findByCursor.mockImplementation(() => of([new ScrollEntity('page')]));
    mountResource(database.database, options);

    expect(database.findByCursor).toHaveBeenCalledOnce();

    options.value = {
      where: { createdAt: { $gt: new Date('2026-07-01T00:00:00.000Z') } },
      orderBy: [{ field: 'id', sort: 'asc' }],
      limit: 2
    };
    await flushWatchers();

    expect(database.findByCursor).toHaveBeenCalledTimes(2);
  });

  it('tracks reactive dependencies inside function options', async () => {
    const database = createDatabase();
    const status = ref('first');
    database.findByCursor.mockImplementation(options => of([new ScrollEntity(String(options.where.status))]));
    const { resource } = mountResource(database.database, () => createOptions(status.value, 2));

    status.value = 'second';
    await flushWatchers();

    expect(database.findByCursor).toHaveBeenCalledTimes(2);
    expect(resource.value.value[0]?.id).toBe('second');
  });

  it('waits for an asynchronously provided database and loads when it becomes available', async () => {
    const databaseRef = shallowRef<RxDB>();
    const database = createDatabase();
    database.findByCursor.mockReturnValue(of([new ScrollEntity('ready')]));

    const { resource } = mountResource(databaseRef, createOptions('pending', 2));
    expect(resource.value.value).toEqual([]);
    expect(resource.isEmpty.value).toBe(false);
    expect(resource.isLoading.value).toBe(false);

    databaseRef.value = database.database;
    await flushWatchers();

    expect(database.findByCursor).toHaveBeenCalledOnce();
    expect(resource.value.value[0]?.id).toBe('ready');
  });

  it('resets subscriptions and pages when the provided database changes or becomes pending', async () => {
    const firstDatabase = createDatabase();
    const secondDatabase = createDatabase();
    const firstPage = new BehaviorSubject([new ScrollEntity('first-db')]);
    firstDatabase.findByCursor.mockReturnValue(firstPage);
    secondDatabase.findByCursor.mockReturnValue(of([new ScrollEntity('second-db')]));
    const databaseRef = shallowRef<RxDB | undefined>(firstDatabase.database);

    const { resource } = mountResource(databaseRef, createOptions('switch', 2));
    databaseRef.value = secondDatabase.database;
    await flushWatchers();

    expect(firstPage.observed).toBe(false);
    expect(secondDatabase.findByCursor).toHaveBeenCalledOnce();
    expect(resource.value.value[0]?.id).toBe('second-db');

    databaseRef.value = undefined;
    await flushWatchers();

    expect(resource.value.value).toEqual([]);
    expect(resource.isLoading.value).toBe(false);
    expect(resource.isEmpty.value).toBe(false);
  });

  it('throws the established integration error when no provider exists', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Consumer = createSetupHarness(() => {
      useInfiniteScroll(ScrollEntity, createOptions('missing', 2));
    });

    expect(() => mount(Consumer)).toThrow('RxDB not provided. Make sure to call provideRxDB() in parent component.');
    expect(warning).toHaveBeenCalled();
  });

  // RAN-008：`setQueryError()` 早先无视 cause，一律换成
  // `Failed to load ${EntityType.name} cursor page` —— 消费者拿不到任何可诊断信息，
  // 三端保真度也不一致（Angular/React 都原样透传 Error 实例）。
  it('keeps an error distinct from an empty successful result and preserves the cause', () => {
    const database = createDatabase();
    const cause = new Error('database failed');
    database.findByCursor.mockReturnValue(throwError(() => cause));

    const { resource } = mountResource(database.database, createOptions('error', 2));

    expect(resource.error.value).toBe(cause);
    expect(resource.isLoading.value).toBe(false);
    expect(resource.isEmpty.value).toBe(false);
    expect(resource.hasMore.value).toBe(true);
  });

  it('normalizes synchronous repository failures into the public error state', () => {
    const database = createDatabase();
    const cause = new Error('synchronous database failure');
    database.findByCursor.mockImplementation(() => {
      throw cause;
    });

    const { resource } = mountResource(database.database, createOptions('throw', 2));

    expect(resource.error.value).toBe(cause);
    expect(resource.isLoading.value).toBe(false);
    expect(resource.isEmpty.value).toBe(false);
  });

  it.each([
    ['字符串', 'string failure', 'string failure'],
    ['普通对象', { code: 500 }, '[object Object]'],
    ['null', null, 'null']
  ])('wraps a non-Error %s payload into a real Error', (_label, payload, message) => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(throwError(() => payload));

    const { resource } = mountResource(database.database, createOptions('error-payload', 2));

    expect(resource.error.value).toBeInstanceOf(Error);
    expect(resource.error.value?.message).toBe(message);
  });

  // RAN-007：complete 只清 isLoading，hasMore 的唯一写入点在 next 里，
  // 因此「一次 next 都没有就 complete」会让 hasMore 停在初值 true ——
  // 自动触底的消费者会用同一游标无限重发。Angular / React 侧同款修复。
  it('settles hasMore when the stream completes without ever emitting', () => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(observer => {
        observer.complete();
        return { closed: true, unsubscribe: vi.fn() } as unknown as Subscription;
      })
    );

    const { resource } = mountResource(database.database, createOptions('empty-complete', 2));

    expect(resource.isLoading.value).toBe(false);
    expect(resource.hasMore.value).toBe(false);

    const callsAfterInitialLoad = database.findByCursor.mock.calls.length;
    resource.loadMore();

    expect(database.findByCursor.mock.calls.length).toBe(callsAfterInitialLoad);
  });

  it('settles hasMore when the stream completes asynchronously without emitting', () => {
    const database = createDatabase();
    let observer: CursorObserver | undefined;
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(current => {
        observer = current;
        return { closed: false, unsubscribe: vi.fn() } as unknown as Subscription;
      })
    );

    const { resource } = mountResource(database.database, createOptions('async-empty-complete', 2));
    if (!observer) throw new Error('Query observer was not captured');

    expect(resource.isLoading.value).toBe(true);
    expect(resource.hasMore.value).toBe(true);

    observer.complete();

    expect(resource.isLoading.value).toBe(false);
    expect(resource.hasMore.value).toBe(false);
    expect(resource.isEmpty.value).toBe(true);
  });

  it('settles hasMore when a later page completes without emitting and keeps the loaded pages', () => {
    const database = createDatabase();
    const first = new ScrollEntity('one');
    database.findByCursor.mockReturnValueOnce(of([first]));
    database.findByCursor.mockReturnValueOnce(
      createBoundaryObservable(current => {
        current.complete();
        return { closed: true, unsubscribe: vi.fn() } as unknown as Subscription;
      })
    );

    const { resource } = mountResource(database.database, createOptions('tail-empty-complete', 1));

    expect(resource.hasMore.value).toBe(true);

    resource.loadMore();

    expect(resource.hasMore.value).toBe(false);
    expect(resource.isLoading.value).toBe(false);
    // 空的尾页不该抹掉已加载的前页，也不该被当成「空结果」
    expect(resource.value.value.map(entity => entity.id)).toEqual(['one']);
    expect(resource.isEmpty.value).toBe(false);
  });

  it('settles hasMore when the stream completes without emitting after a refresh', () => {
    const database = createDatabase();
    database.findByCursor.mockReturnValueOnce(of([new ScrollEntity('one')]));
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(current => {
        current.complete();
        return { closed: true, unsubscribe: vi.fn() } as unknown as Subscription;
      })
    );

    const { resource } = mountResource(database.database, createOptions('refresh-empty-complete', 1));

    expect(resource.hasMore.value).toBe(true);

    // refresh 把 hasMore 复位成 true，随后的空 complete 必须再次把它收敛回 false
    resource.refresh();

    expect(resource.hasMore.value).toBe(false);
    expect(resource.value.value).toEqual([]);
    expect(resource.isEmpty.value).toBe(true);
  });

  it('does not retain a subscription that completes synchronously', () => {
    const database = createDatabase();
    const unsubscribe = vi.fn();
    const subscription = { closed: true, unsubscribe } as unknown as Subscription;
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(observer => {
        observer.complete();
        return subscription;
      })
    );

    const { wrapper } = mountResource(database.database, createOptions('sync-complete', 2));
    wrapper.unmount();

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('removes an active subscription when it completes asynchronously', () => {
    const database = createDatabase();
    const unsubscribe = vi.fn();
    const subscription = { closed: false, unsubscribe } as unknown as Subscription;
    let observer: CursorObserver | undefined;
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(current => {
        observer = current;
        return subscription;
      })
    );

    const { wrapper } = mountResource(database.database, createOptions('async-complete', 2));
    if (!observer) throw new Error('Query observer was not captured');
    observer.complete();
    wrapper.unmount();

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('removes an active subscription when it errors asynchronously', () => {
    const database = createDatabase();
    const unsubscribe = vi.fn();
    const subscription = { closed: false, unsubscribe } as unknown as Subscription;
    let observer: CursorObserver | undefined;
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(current => {
        observer = current;
        return subscription;
      })
    );

    const { wrapper } = mountResource(database.database, createOptions('async-error', 2));
    if (!observer) throw new Error('Query observer was not captured');
    observer.error(new Error('late error'));
    wrapper.unmount();

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('ignores late emissions and public commands after unmount', () => {
    const database = createDatabase();
    const unsubscribe = vi.fn();
    const subscription = { closed: false, unsubscribe } as unknown as Subscription;
    let observer: CursorObserver | undefined;
    database.findByCursor.mockReturnValue(
      createBoundaryObservable(current => {
        observer = current;
        return subscription;
      })
    );

    const { resource, wrapper } = mountResource(database.database, createOptions('unmount', 2));
    wrapper.unmount();
    if (!observer) throw new Error('Query observer was not captured');
    observer.next([new ScrollEntity('late')]);
    resource.loadMore();
    resource.refresh();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(database.findByCursor).toHaveBeenCalledOnce();
    expect(resource.value.value).toEqual([]);
  });

  it('uses the default page limit when callers omit limit', () => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(of([new ScrollEntity('one')]));

    const { resource } = mountResource(database.database, createOptions('default-limit'));

    expect(resource.hasMore.value).toBe(false);
  });

  // RRE-006（三框架同款）：`hasMore` 用 `result.length >= (limit ?? 100)`，
  // 显式 0 让任何结果都满足 `>= 0`，于是永久宣称有下一页 —— 自动触底的消费者会无界重复请求。
  // 核心已冻结契约：`limit: 0` 是合法值、语义是「返回空集」
  // （`packages/rxdb/src/repository/Repository.ts:173,230`）。
  it('treats an explicit zero limit as no further pages', () => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(of([]));

    const { resource } = mountResource(database.database, createOptions('zero-limit', 0));

    expect(resource.hasMore.value).toBe(false);
    expect(resource.value.value).toEqual([]);
  });

  // RVU-005：`result.length >= (limit ?? 100)` 对负数恒真（`0 >= -1`），
  // NaN 则让上层与底层得出相反结论。页容量非正 ⇒ 永远装不满 ⇒ 没有下一页。
  it.each([
    ['负数 limit', -1],
    ['NaN limit', Number.NaN]
  ])('treats a non-positive %s as no further pages', (_label, limit) => {
    const database = createDatabase();
    database.findByCursor.mockReturnValue(of([new ScrollEntity('one')]));

    const { resource } = mountResource(database.database, createOptions('non-positive-limit', limit));

    expect(resource.hasMore.value).toBe(false);

    const callsAfterInitialLoad = database.findByCursor.mock.calls.length;
    resource.loadMore();

    expect(database.findByCursor.mock.calls.length).toBe(callsAfterInitialLoad);
  });

  it('accepts the public entity constructor type without widening it', () => {
    const entityType: EntityType = ScrollEntity;
    expect(entityType).toBe(ScrollEntity);
  });

  // RVU-001（React 侧 RRE-002 同款）：`FindByCursorOptions.after/before` 的公开类型就是
  // `InstanceType<T>`，而实体由 `Object.create(EntityType.prototype)` 造出、再包一层
  // 只有 set 陷阱的 `Proxy` —— 整包丢给只认 plain object 的 `createStableKey`
  // 必然命中它的宿主对象拒绝分支，带初始游标挂载会在 **setup 阶段**抛 TypeError，
  // `findByCursor` 一次也发不出去。现在游标先按 `orderBy` 字段投影成确定快照。
  describe('初始游标实体（RVU-001）', () => {
    /** 复刻 `packages/rxdb/src/entity/proxy.ts` 的包装：只有 set 陷阱，getPrototypeOf 透传。 */
    const asProxied = (entity: ScrollEntity): ScrollEntity =>
      new Proxy(entity, { set: (target, key, value) => Reflect.set(target, key, value) });

    const withCursor = (after: ScrollEntity, sort: 'asc' | 'desc' = 'asc'): CursorOptions => ({
      where: { status: 'active' },
      orderBy: [
        { field: 'sort', sort },
        { field: 'id', sort: 'asc' }
      ],
      limit: 2,
      after
    });

    it.each([
      ['裸实体', (entity: ScrollEntity): ScrollEntity => entity],
      ['Proxy 包装的实体', asProxied]
    ])('%s 当初始 after 时正常发起查询', (_name, prepare) => {
      const database = createDatabase();
      const cursor = prepare(new ScrollEntity('cursor', 'Cursor', 1));
      database.findByCursor.mockReturnValue(of([new ScrollEntity('next', 'Next', 2)]));

      const { resource } = mountResource(database.database, withCursor(cursor));

      expect(database.findByCursor).toHaveBeenCalledOnce();
      expect(database.findByCursor.mock.calls[0]?.[0].after?.id).toBe('cursor');
      expect(resource.value.value.map(entity => entity.id)).toEqual(['next']);
      expect(resource.error.value).toBeUndefined();
    });

    it('before 游标同样可用', () => {
      const database = createDatabase();
      database.findByCursor.mockReturnValue(of([new ScrollEntity('prev')]));
      const options = withCursor(new ScrollEntity('cursor'));
      delete options.after;
      options.before = asProxied(new ScrollEntity('cursor'));

      const { resource } = mountResource(database.database, options);

      expect(database.findByCursor).toHaveBeenCalledOnce();
      expect(resource.value.value.map(entity => entity.id)).toEqual(['prev']);
    });

    // 游标身份 = orderBy 字段取值。活查询会不断回填非排序字段（这里是 name），
    // 若那也算「换了游标」，重订阅 → 回填 → 再重订阅就成了死循环。
    it('同 identity 的新实例不重查，orderBy 字段变了才重查', async () => {
      const database = createDatabase();
      const options = shallowRef<CursorOptions>(withCursor(new ScrollEntity('cursor', 'Cursor', 1)));
      database.findByCursor.mockImplementation(() => of([new ScrollEntity('next')]));
      mountResource(database.database, options);

      options.value = withCursor(asProxied(new ScrollEntity('cursor', '改了标题但没挪位置', 1)));
      await flushWatchers();
      expect(database.findByCursor).toHaveBeenCalledOnce();

      options.value = withCursor(new ScrollEntity('cursor', 'Cursor', 9));
      await flushWatchers();
      expect(database.findByCursor).toHaveBeenCalledTimes(2);
    });

    // 投影只取 orderBy 字段，非游标部分（这里是 orderBy 自身的方向）仍逐字参与 key
    it('选项其余部分的变化照常触发重查', async () => {
      const database = createDatabase();
      const cursor = new ScrollEntity('cursor', 'Cursor', 1);
      const options = shallowRef<CursorOptions>(withCursor(cursor));
      database.findByCursor.mockImplementation(() => of([new ScrollEntity('next')]));
      mountResource(database.database, options);

      options.value = withCursor(cursor, 'desc');
      await flushWatchers();

      expect(database.findByCursor).toHaveBeenCalledTimes(2);
    });

    // 投影只是把游标换成快照，不放宽「什么算可序列化」：
    // 排序字段上挂函数依旧报错，而不是静默算出一个假 key 让内容变化再也测不出来。
    // （Vue 的错误语义：setup 在 watch 处中断后组件仍会挂载，错误经 app 层抛出。）
    it('游标身份字段不可序列化时仍然报错，不静默出 key', () => {
      const database = createDatabase();
      const broken = new ScrollEntity('cursor');
      Object.defineProperty(broken, 'sort', { value: () => 1, enumerable: true });
      database.findByCursor.mockReturnValue(of([]));

      expect(() => mountResource(database.database, withCursor(broken))).toThrow(
        /RxDB query options must contain serializable values/
      );
    });
  });

  // RVU-004（三框架同款，Angular RAN-001 / React RRE-005）：每页保留一条独立活查询，
  // `after` 在创建那一刻被固化，之后上一页怎么变都不重算，最后只做 `pages.flat()`。
  // 上一页的**尾边界**一旦移动，下一页的锚点就失效：头插会让边界条目永久消失，
  // 删除会让同一条目在相邻两页重复。
  //
  // 夹具必须是**真的活游标查询**（数据集一变、所有在订阅的页一起按各自游标重新 emit）——
  // `mockReturnValueOnce` 链让每页内容与游标脱钩，边界移动在那种夹具里根本不会发生。
  describe('live cursor boundary (RVU-004)', () => {
    const row = (id: string, sort: number): ScrollEntity => new ScrollEntity(id, `Item ${id}`, sort);

    /** 复刻 `WHERE (sort, id) > (cursor.sort, cursor.id)`：游标行本身被删掉也照样可比。 */
    const isAfter = (candidate: ScrollEntity, cursor: ScrollEntity): boolean =>
      candidate.sort === cursor.sort ? candidate.id > cursor.id : candidate.sort > cursor.sort;

    const byOrderBy = (a: ScrollEntity, b: ScrollEntity): number =>
      a.sort === b.sort ? a.id.localeCompare(b.id) : a.sort - b.sort;

    /** 单一数据集 + 每页一条按自身游标切片的活查询，数据集变化同时推给所有页。 */
    const createLiveDataset = (database: DatabaseHarness, initial: ScrollEntity[]): BehaviorSubject<ScrollEntity[]> => {
      const rows$ = new BehaviorSubject<ScrollEntity[]>(initial);
      database.findByCursor.mockImplementation(options =>
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

    const initialRows = (): ScrollEntity[] => [row('a', 1), row('b', 2), row('c', 3), row('d', 4)];

    /** 载入两页：`[a,b]` 与 after-b 的 `[c,d]`。 */
    const loadTwoPages = (): {
      resource: InfiniteScrollResource<ScrollEntity>;
      rows$: BehaviorSubject<ScrollEntity[]>;
    } => {
      const database = createDatabase();
      const rows$ = createLiveDataset(database, initialRows());
      const { resource } = mountResource(database.database, createOptions('boundary', 2));
      resource.loadMore();

      expect(resource.value.value.map(entity => entity.id)).toEqual(['a', 'b', 'c', 'd']);
      return { resource, rows$ };
    };

    it('keeps the boundary entity when a head insert shifts the first page', () => {
      const { resource, rows$ } = loadTwoPages();

      // 头插：首页变成 [x,a]，尾边界从 b 移到 a —— 第二页仍锚在 b 上就会漏掉 b
      rows$.next([row('x', 0), ...initialRows()]);

      expect(resource.value.value.map(entity => entity.id)).toEqual(['x', 'a', 'b', 'c']);
    });

    it('does not repeat an entity when a deletion pulls the next page into the first', () => {
      const { resource, rows$ } = loadTwoPages();

      // 删掉 b：首页补进 c，尾边界从 b 移到 c —— 第二页仍锚在 b 上就会把 c 再发一遍
      rows$.next([row('a', 1), row('c', 3), row('d', 4)]);

      expect(resource.value.value.map(entity => entity.id)).toEqual(['a', 'c', 'd']);
    });

    it('keeps every entity when a reorder moves an entity across the page boundary', () => {
      const { resource, rows$ } = loadTwoPages();

      // d 排到最前：首页变成 [d,a]，尾边界从 b 移到 a
      rows$.next([row('a', 1), row('b', 2), row('c', 3), row('d', 0)]);

      expect(resource.value.value.map(entity => entity.id)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('drops trailing pages when the first page loses every entity', () => {
      const { resource, rows$ } = loadTwoPages();

      rows$.next([]);

      expect(resource.value.value).toEqual([]);
      expect(resource.hasMore.value).toBe(false);
    });
  });

  // RAN-013：三端共享状态序列。同一份 SHARED_STATE_SEQUENCE 字面量逐字出现在
  // packages/rxdb-angular/src/__tests__/InfiniteScrollingList.spec.ts 与
  // packages/rxdb-react/src/__tests__/useInfiniteScroll.spec.ts —— 任何一端在
  // 「加载失败后是否保留已加载页 / hasMore 是否被错误连带清掉 / refresh 是否清错误」
  // 上跑偏，都会在这条用例里以 diff 的形式暴露，而不是等消费者跨端迁移时才发现。
  describe('三端共享状态序列（RAN-013）', () => {
    it('初始加载 → 下一页失败 → refresh 恢复：结算态与 Angular/React 逐帧一致', () => {
      const database = createDatabase();
      const firstPage = [new ScrollEntity('a', 'A'), new ScrollEntity('b', 'B')];
      database.findByCursor
        .mockReturnValueOnce(of(firstPage))
        .mockReturnValueOnce(throwError(() => new Error('page 2 unavailable')))
        .mockReturnValueOnce(of(firstPage));

      const { resource } = mountResource(database.database, createOptions('shared-sequence', 2));

      const snapshot = (step: string) => ({
        step,
        ids: resource.value.value.map(entity => entity.id),
        isLoading: resource.isLoading.value,
        hasMore: resource.hasMore.value,
        error: resource.error.value?.message,
        isEmpty: resource.isEmpty.value
      });

      const sequence = [snapshot('initial')];
      resource.loadMore();
      sequence.push(snapshot('loadMore-failed'));
      resource.refresh();
      sequence.push(snapshot('refresh-recovered'));

      expect(sequence).toEqual(SHARED_STATE_SEQUENCE);
    });
  });
});

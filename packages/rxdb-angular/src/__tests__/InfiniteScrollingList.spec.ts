import { EntityType, RxDB, type FindByCursorOptions } from '@aiao/rxdb';
import { effect, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, EMPTY, map, Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfiniteScrollingList } from '../InfiniteScrollingList';
import { useInfiniteScroll, type InfiniteScrollResource } from '../use-infinite-scroll';

// zoneless 环境不可用 fakeAsync/tick：用一个 macrotask 等待微任务（nextMicroTask）与订阅回调结算
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// 模拟实体类。
class MockEntity {
  id: string;
  name: string;
  status?: string;

  constructor(data: { id: string; name: string }) {
    this.id = data.id;
    this.name = data.name;
  }
}

// 单点断言 mock 满足实体类型契约
const TestEntity = MockEntity as unknown as EntityType;

const cursorOptions = (
  overrides: Partial<FindByCursorOptions<typeof TestEntity>> = {}
): FindByCursorOptions<typeof TestEntity> => ({
  where: { combinator: 'and', rules: [] },
  orderBy: [{ field: 'id', sort: 'asc' }],
  ...overrides
});

// `_mockGetRepository` 单独暴露：RAN-004 需要让仓库查找本身同步抛出
type MockRxDB = RxDB & {
  _mockFindByCursor: ReturnType<typeof vi.fn>;
  _mockGetRepository: ReturnType<typeof vi.fn>;
};

const createMockRxDB = (): MockRxDB => {
  const mockFindByCursor = vi.fn();
  const mockGetRepository = vi.fn(() => ({ findByCursor: mockFindByCursor }));
  return {
    entityManager: { getRepository: mockGetRepository },
    _mockFindByCursor: mockFindByCursor,
    _mockGetRepository: mockGetRepository
  } as unknown as MockRxDB;
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

describe('InfiniteScrollingList', () => {
  let mockRxDB: MockRxDB;

  beforeEach(() => {
    mockRxDB = createMockRxDB();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: RxDB, useValue: mockRxDB }]
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 未销毁的 injector 会让本测试创建但未 flush 的 effect（如 initialization 用例）
    // 被后续测试的 flushEffects() 意外唤醒，用旧 mock 触发未处理的 rejection。
    TestBed.resetTestingModule();
  });

  describe('initialization', () => {
    it('should create instance with default state', () => {
      TestBed.runInInjectionContext(() => {
        const list = new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }));

        expect(list.value()).toEqual([]);
        expect(list.isLoading()).toBe(false);
        expect(list.hasMore()).toBe(true);
        expect(list.error()).toBeUndefined();
        expect(list.hasValue()).toBe(false);
      });
    });

    it('should support signal options for reactive queries', () => {
      TestBed.runInInjectionContext(() => {
        const optionsSignal = signal(cursorOptions({ limit: 10 }));
        const list = new InfiniteScrollingList(mockRxDB, TestEntity, optionsSignal);

        expect(list).toBeDefined();
      });
    });
  });

  describe('loadMore', () => {
    it('should load first page on initialization', async () => {
      const mockData = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      mockRxDB._mockFindByCursor.mockReturnValue(of(mockData));

      TestBed.runInInjectionContext(() => {
        new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }));
      });

      // effect 会自动触发 loadMore。
      TestBed.flushEffects();
      await settle();

      expect(mockRxDB.entityManager.getRepository).toHaveBeenCalledWith(MockEntity);
      expect(mockRxDB._mockFindByCursor).toHaveBeenCalled();
    });

    it('uses 100 as the default page limit', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([]));

      TestBed.runInInjectionContext(() => {
        new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions());
      });
      TestBed.flushEffects();
      await settle();

      expect(mockRxDB._mockFindByCursor).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    });

    it('should append data to list on subsequent loadMore', async () => {
      // 首页必须满页（= limit），否则 hasMore 变 false，第二次 loadMore 会被正确忽略
      const page1 = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Item ${i + 1}` }));
      const page2 = [
        { id: '11', name: 'Item 11' },
        { id: '12', name: 'Item 12' }
      ];

      let callCount = 0;
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        callCount++;
        return of(callCount === 1 ? page1 : page2);
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      // 加载第二页。
      list.loadMore();
      await settle();

      expect(mockRxDB._mockFindByCursor).toHaveBeenCalledTimes(2);
      // 两页数据都应在列表中（append 而非覆盖）
      expect(list.value().length).toBe(12);
      expect(list.value()[10].id).toBe('11');
    });

    it('should not loadMore when isLoading is true', async () => {
      const subject = new Subject<MockEntity[]>();
      mockRxDB._mockFindByCursor.mockReturnValue(subject.asObservable());

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      // 第一次调用开始加载。
      expect(list.isLoading()).toBe(true);

      // 第二次调用应忽略。
      list.loadMore();

      expect(mockRxDB._mockFindByCursor).toHaveBeenCalledTimes(1);

      subject.next([]);
      subject.complete();
    });

    it('should not loadMore when hasMore is false', async () => {
      // 返回少于 limit 的条目，表示数据结束。
      const lastPage = [{ id: '1', name: 'Last Item' }];
      mockRxDB._mockFindByCursor.mockReturnValue(of(lastPage));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.hasMore()).toBe(false);

      // 此调用应忽略。
      list.loadMore();

      // 只应发生初始调用。
      expect(mockRxDB._mockFindByCursor).toHaveBeenCalledTimes(1);
    });

    // RRE-006（三框架同款）：`hasMore.set(result.length >= limit)` 在 `limit: 0` 时
    // 恒为 true（`>= 0`），于是永久宣称有下一页 —— 自动触底的消费者会无界重复请求。
    // 核心已冻结契约：`limit: 0` 是合法值、语义是「返回空集」
    // （`packages/rxdb/src/repository/Repository.ts:173,230`）。
    it('should treat an explicit zero limit as no further pages', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([]));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 0 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.hasMore()).toBe(false);
      expect(list.value()).toEqual([]);
    });

    it('should set hasMore to false when results less than limit', async () => {
      const partialPage = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      mockRxDB._mockFindByCursor.mockReturnValue(of(partialPage));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.hasMore()).toBe(false);
    });

    // RxDB 是活查询：同一页的订阅在数据变化时会重新 emit。只有单向置 false 的分支时，
    // 首屏不满页关掉 hasMore 后即使该页被补满，loadMore() 也会被 `!hasMore()` 直接挡掉，
    // 用户再也翻不动页。React / Vue 都是 `hasMore = result.length >= limit` 的双向赋值。
    it('should restore hasMore to true when a live re-emit fills the page', async () => {
      const subject = new Subject<unknown[]>();
      mockRxDB._mockFindByCursor.mockReturnValue(subject.asObservable());

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 3 }))
      );

      TestBed.flushEffects();
      await settle();

      subject.next([
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ]);
      await settle();
      expect(list.hasMore()).toBe(false);

      // 活查询回补：同一订阅再 emit 满页
      subject.next([
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' }
      ]);
      await settle();
      expect(list.hasMore()).toBe(true);

      const callsBefore = mockRxDB._mockFindByCursor.mock.calls.length;
      list.loadMore();
      await settle();
      expect(mockRxDB._mockFindByCursor.mock.calls.length).toBe(callsBefore + 1);
    });

    it('should keep hasMore true when a full page completes, and allow next loadMore', async () => {
      // 首页刚好等于 limit：即使 Observable next 后 complete，也应允许继续加载
      const fullPage = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Item ${i + 1}` }));
      const page2 = [{ id: '11', name: 'Item 11' }];

      let callCount = 0;
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        callCount++;
        // of() 会在 next 之后立即 complete，正好复现 bug 场景
        return of(callCount === 1 ? fullPage : page2);
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      // 首页满页且已 complete，仍应允许继续加载
      expect(list.hasMore()).toBe(true);

      list.loadMore();
      await settle();

      expect(mockRxDB._mockFindByCursor).toHaveBeenCalledTimes(2);
      const calls = mockRxDB._mockFindByCursor.mock.calls;
      expect(calls[1][0].after).toBeDefined();
      expect(calls[1][0].after.id).toBe('10');
    });

    it('keeps loaded page subscriptions active while loading later pages', async () => {
      const firstPage = new Subject<MockEntity[]>();
      const secondPage = new Subject<MockEntity[]>();
      mockRxDB._mockFindByCursor
        .mockReturnValueOnce(firstPage.asObservable())
        .mockReturnValueOnce(secondPage.asObservable());

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 2 }))
      );

      TestBed.flushEffects();
      await settle();
      firstPage.next([
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ]);

      list.loadMore();
      secondPage.next([{ id: '3', name: 'Item 3' }]);
      firstPage.next([
        { id: '1', name: 'Updated Item 1' },
        { id: '2', name: 'Item 2' }
      ]);

      expect(firstPage.observed).toBe(true);
      expect(list.value().map(entity => entity.name)).toEqual(['Updated Item 1', 'Item 2', 'Item 3']);
    });

    it('keeps the current page loading when an earlier page completes', async () => {
      const firstPage = new Subject<MockEntity[]>();
      const secondPage = new Subject<MockEntity[]>();
      mockRxDB._mockFindByCursor
        .mockReturnValueOnce(firstPage.asObservable())
        .mockReturnValueOnce(secondPage.asObservable());

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 1 }))
      );
      TestBed.flushEffects();
      await settle();

      firstPage.next([{ id: '1', name: 'Item 1' }]);
      list.loadMore();
      firstPage.complete();

      expect(list.isLoading()).toBe(true);
      secondPage.next([]);
      expect(list.isLoading()).toBe(false);
    });

    it('keeps the current page loading when an earlier page errors', async () => {
      const firstPage = new Subject<MockEntity[]>();
      const secondPage = new Subject<MockEntity[]>();
      mockRxDB._mockFindByCursor
        .mockReturnValueOnce(firstPage.asObservable())
        .mockReturnValueOnce(secondPage.asObservable());

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 1 }))
      );
      TestBed.flushEffects();
      await settle();

      firstPage.next([{ id: '1', name: 'Item 1' }]);
      list.loadMore();
      const pageError = new Error('First page stream failed');
      firstPage.error(pageError);

      expect(list.error()).toBe(pageError);
      expect(list.isLoading()).toBe(true);
      secondPage.next([]);
      expect(list.isLoading()).toBe(false);
    });

    it('should pass after cursor for subsequent pages', async () => {
      const page1 = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
        { id: '4', name: 'Item 4' },
        { id: '5', name: 'Item 5' },
        { id: '6', name: 'Item 6' },
        { id: '7', name: 'Item 7' },
        { id: '8', name: 'Item 8' },
        { id: '9', name: 'Item 9' },
        { id: '10', name: 'Item 10' }
      ];
      const page2 = [{ id: '11', name: 'Item 11' }];

      let callCount = 0;
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        callCount++;
        return of(callCount === 1 ? page1 : page2);
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      list.loadMore();
      await settle();

      const calls = mockRxDB._mockFindByCursor.mock.calls;
      expect(calls[1][0].after).toBeDefined();
      expect(calls[1][0].after.id).toBe('10');
    });
  });

  // RAN-001（三框架同款，React RRE-005 / Vue RVU-004）：每页保留一条独立活查询，
  // `after` 在创建那一刻被固化，之后上一页怎么变都不重算，最后只做 `pages.flat()`。
  // 上一页的**尾边界**一旦移动，下一页的锚点就失效：头插会让边界条目永久消失，
  // 删除会让同一条目在相邻两页重复。
  //
  // 夹具必须是**真的活游标查询**（数据集一变、所有在订阅的页一起按各自游标重新 emit）——
  // `mockReturnValueOnce` 链让每页内容与游标脱钩，边界移动在那种夹具里根本不会发生，
  // 这正是本缺陷长期无人发现的原因（原 `keeps loaded page subscriptions active…`
  // 用例让首页尾条目 id 恒为 '2'，恰好绕开了边界移动）。
  describe('live cursor boundary (RAN-001)', () => {
    interface Row {
      id: string;
      name: string;
      sort: number;
    }

    const row = (id: string, sort: number): Row => ({ id, name: `Item ${id}`, sort });

    /** 复刻 `WHERE (sort, id) > (cursor.sort, cursor.id)`：游标行本身被删掉也照样可比。 */
    const isAfter = (candidate: Row, cursor: Row): boolean =>
      candidate.sort === cursor.sort ? candidate.id > cursor.id : candidate.sort > cursor.sort;

    const byOrderBy = (a: Row, b: Row): number => (a.sort === b.sort ? a.id.localeCompare(b.id) : a.sort - b.sort);

    /** 单一数据集 + 每页一条按自身游标切片的活查询，数据集变化同时推给所有页。 */
    const createLiveDataset = (initial: Row[]) => {
      const rows$ = new BehaviorSubject<Row[]>(initial);
      mockRxDB._mockFindByCursor.mockImplementation((options: FindByCursorOptions<typeof TestEntity>) =>
        rows$.pipe(
          map(rows => {
            const ordered = [...rows].sort(byOrderBy);
            const cursor = options.after as Row | undefined;
            const rest = cursor ? ordered.filter(candidate => isAfter(candidate, cursor)) : ordered;
            return rest.slice(0, options.limit);
          })
        )
      );
      return rows$;
    };

    /** 载入两页：`[a,b]` 与 after-b 的 `[c,d]`。 */
    const loadTwoPages = async (rows$: BehaviorSubject<Row[]>) => {
      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 2 }))
      );
      TestBed.flushEffects();
      await settle();
      list.loadMore();
      await settle();

      expect(list.value().map(entity => entity.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(rows$.observed).toBe(true);
      return list;
    };

    const initialRows = (): Row[] => [row('a', 1), row('b', 2), row('c', 3), row('d', 4)];

    it('keeps the boundary entity when a head insert shifts the first page', async () => {
      const rows$ = createLiveDataset(initialRows());
      const list = await loadTwoPages(rows$);

      // 头插：首页变成 [x,a]，尾边界从 b 移到 a —— 第二页仍锚在 b 上就会漏掉 b
      rows$.next([row('x', 0), ...initialRows()]);
      await settle();

      expect(list.value().map(entity => entity.id)).toEqual(['x', 'a', 'b', 'c']);
    });

    it('does not repeat an entity when a deletion pulls the next page into the first', async () => {
      const rows$ = createLiveDataset(initialRows());
      const list = await loadTwoPages(rows$);

      // 删掉 b：首页补进 c，尾边界从 b 移到 c —— 第二页仍锚在 b 上就会把 c 再发一遍
      rows$.next([row('a', 1), row('c', 3), row('d', 4)]);
      await settle();

      expect(list.value().map(entity => entity.id)).toEqual(['a', 'c', 'd']);
    });

    it('keeps every entity when a reorder moves an entity across the page boundary', async () => {
      const rows$ = createLiveDataset(initialRows());
      const list = await loadTwoPages(rows$);

      // d 排到最前：首页变成 [d,a]，尾边界从 b 移到 a
      rows$.next([row('a', 1), row('b', 2), row('c', 3), row('d', 0)]);
      await settle();

      expect(list.value().map(entity => entity.id)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('drops trailing pages when the first page loses every entity', async () => {
      const rows$ = createLiveDataset(initialRows());
      const list = await loadTwoPages(rows$);

      rows$.next([]);
      await settle();

      expect(list.value()).toEqual([]);
      expect(list.hasMore()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should set error on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockRxDB._mockFindByCursor.mockReturnValue(throwError(() => mockError));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.error()).toBe(mockError);
      expect(list.isLoading()).toBe(false);
    });

    it('should reset error on subsequent loadMore', async () => {
      const mockError = new Error('Network error');
      let callCount = 0;

      mockRxDB._mockFindByCursor.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return throwError(() => mockError);
        }
        return of([{ id: '1', name: 'Item 1' }]);
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.error()).toBe(mockError);

      // 重置 hasMore 以允许重试。
      list.refresh();
      await settle();

      expect(list.error()).toBeUndefined();
    });
  });

  // RAN-004：状态先写成 loading，随后 getRepository / findByCursor / subscribe 三步全在
  // 异常边界外。同步抛出时异常直接逃逸，公开状态永久停在 {isLoading:true, error:undefined}；
  // 自动首屏走 nextMicroTask，逃逸的异常连调用方都接不到。
  // 同包 hooks.ts 与 React/Vue 侧的 useInfiniteScroll 早已把这三步包进 try/catch。
  describe('synchronous failure boundary (RAN-004)', () => {
    const newList = () =>
      TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

    const expectSettledFailure = (list: InfiniteScrollingList<typeof TestEntity>, message: string): void => {
      expect(list.error()).toBeInstanceOf(Error);
      expect(list.error()?.message).toBe(message);
      expect(list.isLoading()).toBe(false);
    };

    it('getRepository 同步抛出：自动首屏不产生逃逸异常，失败可见于 error', async () => {
      mockRxDB._mockGetRepository.mockImplementation(() => {
        throw new Error('setup failed');
      });

      const list = newList();
      TestBed.flushEffects();
      await settle();

      expectSettledFailure(list, 'setup failed');
    });

    it('findByCursor 同步抛出：loadMore 不向调用方抛出', async () => {
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        throw new Error('query failed');
      });

      const list = newList();
      TestBed.flushEffects();
      await settle();

      expect(() => list.refresh()).not.toThrow();
      expectSettledFailure(list, 'query failed');
    });

    it('subscribe 同步抛出：loadMore 不向调用方抛出', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue({
        subscribe: () => {
          throw new Error('subscribe failed');
        }
      } as unknown as Observable<MockEntity[]>);

      const list = newList();
      TestBed.flushEffects();
      await settle();

      expect(() => list.refresh()).not.toThrow();
      expectSettledFailure(list, 'subscribe failed');
    });
  });

  // RAN-008：RxJS 的 error 通道是 unknown，回调参数却直接标注成 Error 并原样写入
  // 声明为 `Error | undefined` 的 signal —— 仓库抛字符串时，消费者按声明读 `.message` 得到 undefined。
  describe('error normalization (RAN-008)', () => {
    const loadWithError = async (payload: unknown) => {
      mockRxDB._mockFindByCursor.mockReturnValue(throwError(() => payload));
      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();
      return list;
    };

    it.each([
      ['字符串', 'string failure', 'string failure'],
      ['普通对象', { code: 500 }, '[object Object]'],
      ['null', null, 'null'],
      ['undefined', undefined, 'undefined']
    ])('error 通道载荷为%s时归一化成 Error', async (_label, payload, message) => {
      const list = await loadWithError(payload);

      expect(list.error()).toBeInstanceOf(Error);
      expect(list.error()?.message).toBe(message);
    });

    it('Error 实例原样透传，保留 identity、子类与 cause', async () => {
      class StorageError extends Error {}
      const root = new Error('root');
      const original = new StorageError('storage down', { cause: root });

      const list = await loadWithError(original);

      expect(list.error()).toBe(original);
      expect(list.error()).toBeInstanceOf(StorageError);
      expect(list.error()?.cause).toBe(root);
    });

    it('同步抛出的非 Error 载荷同样归一化', async () => {
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        throw 'sync string failure';
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();

      expect(list.error()).toBeInstanceOf(Error);
      expect(list.error()?.message).toBe('sync string failure');
    });
  });

  // RAN-007：complete 只清 isLoading，不碰 hasMore。hasMore 的唯一写入点在 next 里，
  // 因此「一次 next 都没有就 complete」（EMPTY）会让 hasMore 停在初值 true ——
  // 消费者得到 {isLoading:false, isEmpty:true, hasMore:true}，自动触底会用同一游标无限重发。
  describe('complete without next (RAN-007)', () => {
    it('无首值完成时收敛 hasMore', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(EMPTY);

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();

      expect(list.isLoading()).toBe(false);
      expect(list.isEmpty()).toBe(true);
      expect(list.hasMore()).toBe(false);
    });

    it('无首值完成后 loadMore 不再重发同一游标', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(EMPTY);

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();
      const callsAfterInitialLoad = mockRxDB._mockFindByCursor.mock.calls.length;

      list.loadMore();
      await settle();

      expect(mockRxDB._mockFindByCursor.mock.calls.length).toBe(callsAfterInitialLoad);
    });

    it('emit 过满页再 complete 时 hasMore 保持 true', async () => {
      const fullPage = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Item ${i + 1}` }));
      mockRxDB._mockFindByCursor.mockReturnValue(of(fullPage));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();

      expect(list.hasMore()).toBe(true);
    });
  });

  describe('refresh', () => {
    it('should reset all state on refresh', async () => {
      const page1 = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      mockRxDB._mockFindByCursor.mockReturnValue(of(page1));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      list.refresh();
      await settle();

      expect(list.hasMore()).toBe(false); // 结果少于 limit，因此仍为 false
      expect(list.error()).toBeUndefined();
    });

    it('should not let a slow stale request pollute the list after refresh', async () => {
      // 旧请求慢、新请求快：refresh 后旧请求迟到 emit 不应写回列表
      const staleSubject = new Subject<MockEntity[]>();
      const freshData = [{ id: 'new', name: 'Fresh Item' }];

      let callCount = 0;
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        callCount++;
        // 第一个请求返回一个永不自动 emit 的 Subject（模拟慢请求）
        return callCount === 1 ? staleSubject.asObservable() : of(freshData);
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      // 首个（慢）请求已在途，此时 refresh 触发新（快）请求
      list.refresh();
      await settle();

      // 新数据已到位
      expect(list.value().map(v => v.id)).toEqual(['new']);

      // 旧请求迟到 emit：不应污染列表
      staleSubject.next([{ id: 'stale', name: 'Stale Item' }]);
      staleSubject.complete();
      await settle();

      expect(list.value().map(v => v.id)).toEqual(['new']);
    });

    it('should reload data from beginning on refresh', async () => {
      const initialData = [{ id: '1', name: 'Old Item' }];
      const refreshedData = [{ id: '2', name: 'New Item' }];

      let callCount = 0;
      mockRxDB._mockFindByCursor.mockImplementation(() => {
        callCount++;
        return of(callCount === 1 ? initialData : refreshedData);
      });

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      list.refresh();
      await settle();

      const calls = mockRxDB._mockFindByCursor.mock.calls;
      // 第二次调用（刷新）不应包含 'after' 游标。
      expect(calls[1][0].after).toBeUndefined();
    });
  });

  // RAN-002：命令方法在读 isLoading/hasMore/#values/响应式 options 之后又写回同一批 signal。
  // 调用方在 effect 里按自己的 trigger 调用时，这些内部 signal 全被登记为该 effect 的依赖，
  // 于是「next 把 isLoading 置回 false」直接唤醒 effect 并立刻请求下一页 —— trigger 从未再变。
  describe('consumer effect isolation (RAN-002)', () => {
    // 每页都装满 → hasMore 恒为 true，依赖一旦被污染就会连续翻页而不是停在某一页
    const fullPage = (base: number): MockEntity[] =>
      Array.from({ length: 10 }, (_, i) => ({ id: String(base + i), name: `Item ${base + i}` }) as MockEntity);

    // 在真实 consumer effect 里驱动命令方法，返回该 effect 的实际重跑次数与新增查询次数
    const driveFromEffect = async (command: (list: InfiniteScrollingList<typeof TestEntity>) => void) => {
      let served = 0;
      mockRxDB._mockFindByCursor.mockImplementation(() => of(fullPage(++served * 10)));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();
      const callsBefore = mockRxDB._mockFindByCursor.mock.calls.length;

      const trigger = signal(0);
      let runs = 0;
      TestBed.runInInjectionContext(() => {
        effect(() => {
          trigger();
          runs += 1;
          // 红态下 effect 被自己写回的 signal 无限唤醒；设上限只为让测试断言失败而不是挂死
          if (runs > 5) return;
          command(list);
        });
      });

      TestBed.flushEffects();
      await settle();
      TestBed.flushEffects();
      await settle();

      return { runs, newCalls: mockRxDB._mockFindByCursor.mock.calls.length - callsBefore };
    };

    it('loadMore 不把内部状态登记进调用方 effect 的依赖', async () => {
      const { runs, newCalls } = await driveFromEffect(list => list.loadMore());

      expect(runs).toBe(1);
      expect(newCalls).toBe(1);
    });

    it('refresh 不把内部状态登记进调用方 effect 的依赖', async () => {
      const { runs, newCalls } = await driveFromEffect(list => list.refresh());

      expect(runs).toBe(1);
      expect(newCalls).toBe(1);
    });
  });

  describe('computed properties', () => {
    it('should compute value as flat array of all pages', async () => {
      const page1 = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      mockRxDB._mockFindByCursor.mockReturnValue(of(page1));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      const value = list.value();
      expect(value.length).toBe(2);
      expect(value[0].id).toBe('1');
      expect(value[1].id).toBe('2');
    });

    it('should compute hasValue based on value length', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([]));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.hasValue()).toBe(false);
    });

    it('should compute isEmpty correctly', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([]));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.isEmpty()).toBe(true);
    });

    // 错误态下 isLoading=false、hasValue=false，缺 error 判定就会把「网络/存储错误」
    // 渲染成「暂无数据」，用户失去重试入口。React / Vue 都显式排除了错误态。
    it('should not report isEmpty while an error is set', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(throwError(() => new Error('boom')));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      TestBed.flushEffects();
      await settle();

      expect(list.error()).toBeInstanceOf(Error);
      expect(list.isEmpty()).toBe(false);
    });

    it('should not report isEmpty before the first load settles', () => {
      mockRxDB._mockFindByCursor.mockReturnValue(new Subject().asObservable());

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );

      // #isInitialized 若是普通字段而非 signal，computed 不会因它翻转而失效
      expect(list.isEmpty()).toBe(false);
    });
  });

  describe('options reactivity', () => {
    it('should reset when signal options change', async () => {
      const data = [{ id: '1', name: 'Item 1' }];
      mockRxDB._mockFindByCursor.mockReturnValue(of(data));

      const optionsSignal = signal(
        cursorOptions({
          limit: 10,
          where: {
            combinator: 'and',
            rules: [{ field: 'status', operator: '=', value: 'active' }]
          }
        })
      );
      TestBed.runInInjectionContext(() => {
        new InfiniteScrollingList(mockRxDB, TestEntity, () => optionsSignal());
      });

      TestBed.flushEffects();
      await settle();

      // 修改选项。
      optionsSignal.set(
        cursorOptions({
          limit: 10,
          where: {
            combinator: 'and',
            rules: [{ field: 'status', operator: '=', value: 'inactive' }]
          }
        })
      );
      TestBed.flushEffects();
      await settle();

      // 应调用 findByCursor 两次（初始调用 + 选项变更后调用）。
      expect(mockRxDB._mockFindByCursor).toHaveBeenCalledTimes(2);
    });
  });

  // RAN-009：error / isLoading / hasMore 在类与接口上都是 WritableSignal。
  // 消费者把 isLoading 强改成 false 就能绕过 loadMore 的并发 guard 发重复页请求，
  // 把 hasMore 改成 true 就能越过终页 —— 内部不变量毫无保护。
  // React 侧返回的是纯值（`readonly isLoading: boolean`），本就不可写。
  describe('read-only state contract (RAN-009)', () => {
    // 类型层：只要哪个状态字段回退成 WritableSignal，这个别名就变成 true，下面的赋值编译失败
    type ExposesWriteApi<S> = S extends { set: unknown } ? true : false;

    it('状态机对外只读，消费者无法越过 loadMore/refresh 改写', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([]));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();

      for (const state of [list.isLoading, list.error, list.hasMore]) {
        expect('set' in state).toBe(false);
        expect('update' in state).toBe(false);
      }
    });

    it('公开的 InfiniteScrollResource 契约不暴露写入 API', () => {
      const isLoadingWritable: ExposesWriteApi<InfiniteScrollResource<MockEntity>['isLoading']> = false;
      const errorWritable: ExposesWriteApi<InfiniteScrollResource<MockEntity>['error']> = false;
      const hasMoreWritable: ExposesWriteApi<InfiniteScrollResource<MockEntity>['hasMore']> = false;

      expect([isLoadingWritable, errorWritable, hasMoreWritable]).toEqual([false, false, false]);
    });
  });

  describe('cleanup', () => {
    it('does not start the deferred initial load after destruction', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([]));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      TestBed.resetTestingModule();
      await settle();

      expect(mockRxDB.entityManager.getRepository).not.toHaveBeenCalled();
      list.loadMore();
      expect(mockRxDB.entityManager.getRepository).not.toHaveBeenCalled();
    });

    it('should cancel in-flight subscription when the injector is destroyed', async () => {
      // DestroyRef 走 __NG_ENV_ID__ 特殊解析，无法用 provider mock；改为行为验证
      const subject = new Subject<MockEntity[]>();
      mockRxDB._mockFindByCursor.mockReturnValue(subject.asObservable());

      TestBed.runInInjectionContext(() => {
        new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }));
      });

      TestBed.flushEffects();
      await settle();

      // 请求在途，订阅存在
      expect(subject.observed).toBe(true);

      // 销毁测试环境注入器 → DestroyRef 回调触发 → 订阅取消
      TestBed.resetTestingModule();

      expect(subject.observed).toBe(false);
    });
  });

  // RAN-012：refresh 先 #resetState() 再 loadMore()，而 loadMore 有 destroyed 守卫 ——
  // 注入器销毁后调 refresh 会先把已渲染的数据抹掉、再什么都不做，用户看到永久空列表。
  // React 侧 useInfiniteScroll 是先 `if (!mountedRef.current) return;` 再 reset。
  describe('destroyed guard on refresh (RAN-012)', () => {
    it('注入器销毁后 refresh 不清空已加载数据', async () => {
      const page = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      mockRxDB._mockFindByCursor.mockReturnValue(of(page));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();
      expect(list.value()).toHaveLength(2);

      TestBed.resetTestingModule();
      list.refresh();

      // 销毁后 refresh 是彻底的 no-op：状态原样保留，而不是「先清屏后空转」
      expect(list.value()).toHaveLength(2);
      expect(list.hasValue()).toBe(true);
    });

    it('注入器销毁后 refresh 不重新发起查询', async () => {
      mockRxDB._mockFindByCursor.mockReturnValue(of([{ id: '1', name: 'Item 1' }]));

      const list = TestBed.runInInjectionContext(
        () => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))
      );
      TestBed.flushEffects();
      await settle();
      mockRxDB._mockFindByCursor.mockClear();

      TestBed.resetTestingModule();
      list.refresh();
      await settle();

      expect(mockRxDB._mockFindByCursor).not.toHaveBeenCalled();
    });
  });

  // RAN-013：三端共享状态序列。同一份 SHARED_STATE_SEQUENCE 字面量逐字出现在
  // packages/rxdb-react/src/__tests__/useInfiniteScroll.spec.ts 与
  // packages/rxdb-vue/src/__tests__/useInfiniteScroll.spec.ts —— 任何一端在
  // 「加载失败后是否保留已加载页 / hasMore 是否被错误连带清掉 / refresh 是否清错误」
  // 上跑偏，都会在这条用例里以 diff 的形式暴露，而不是等消费者跨端迁移时才发现。
  describe('三端共享状态序列（RAN-013）', () => {
    it('初始加载 → 下一页失败 → refresh 恢复：结算态与 React/Vue 逐帧一致', async () => {
      const firstPage = [new MockEntity({ id: 'a', name: 'A' }), new MockEntity({ id: 'b', name: 'B' })];
      mockRxDB._mockFindByCursor
        .mockReturnValueOnce(of(firstPage))
        .mockReturnValueOnce(throwError(() => new Error('page 2 unavailable')))
        .mockReturnValueOnce(of(firstPage));

      let list!: InfiniteScrollingList<typeof TestEntity>;
      TestBed.runInInjectionContext(() => {
        list = new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 2 }));
      });
      TestBed.flushEffects();
      await settle();

      const snapshot = (step: string) => ({
        step,
        ids: list.value().map(item => (item as unknown as MockEntity).id),
        isLoading: list.isLoading(),
        hasMore: list.hasMore(),
        error: list.error()?.message,
        isEmpty: list.isEmpty()
      });

      const sequence = [snapshot('initial')];
      list.loadMore();
      await settle();
      sequence.push(snapshot('loadMore-failed'));
      list.refresh();
      await settle();
      sequence.push(snapshot('refresh-recovered'));

      expect(sequence).toEqual(SHARED_STATE_SEQUENCE);
    });
  });
});

// RAN-012：类在字段初始化器里 `inject(DestroyRef)`，构造器体内还建 effect ——
// 注入上下文之外裸 new 必然 NG0203。这个限制此前只存在于实现细节里，
// TSDoc / README / 测试都没记过，消费者只能在运行时踩到。这里把它钉成契约。
describe('InfiniteScrollingList injection context requirement (RAN-012)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('在注入上下文之外构造时 fail-fast 抛 NG0203', () => {
    const mockRxDB = createMockRxDB();

    expect(() => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 }))).toThrowError(/NG0203/);
  });

  it('在注入上下文之内构造正常', () => {
    const mockRxDB = createMockRxDB();

    expect(() =>
      TestBed.runInInjectionContext(() => new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 10 })))
    ).not.toThrow();
  });
});

describe('useInfiniteScroll', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('creates a list from the injected RxDB instance', () => {
    const mockRxDB = createMockRxDB();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: RxDB, useValue: mockRxDB }]
    });

    TestBed.runInInjectionContext(() => {
      const list = useInfiniteScroll(TestEntity, cursorOptions({ limit: 10 }));

      expect(list).toBeInstanceOf(InfiniteScrollingList);
    });
  });
});

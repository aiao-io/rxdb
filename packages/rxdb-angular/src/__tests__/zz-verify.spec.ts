/**
 * 早期人工探针的断言化版本（RAN-013）。
 *
 * @remarks
 * 这六个用例原本是排查 P1 时留下的**探针**：靠 `console.log` 打印现象，
 * 6 个 `it` 里只有 2 个 `expect` —— S3b 甚至明确打印「instanceof Error = false」
 * 却照样通过。于是 100% 行覆盖率把 RAN-001 ~ RAN-008 一并盖住。
 *
 * 这里逐条改成**会失败**的断言，钉住的正是当时被打印出来、后来才修掉的行为：
 * 错误态不算空、非 Error 载荷归一化成 Error、同键复用同一 signal、跨注入器读盘。
 */
import { ENTITY_STATIC_TYPES, EntityType, RxDB, type FindByCursorOptions, type UUID } from '@aiao/rxdb';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryQuery } from '../hooks';
import { InfiniteScrollingList } from '../InfiniteScrollingList';
import { useState } from '../use-state';

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

class MockEntity {
  static [ENTITY_STATIC_TYPES] = {
    getOptions: { id: '' },
    idType: ''
  };
  static get = vi.fn();
  id: UUID = '00000000-0000-0000-0000-000000000000';
  name = '';
}
const TestEntity = MockEntity as unknown as EntityType;

const createMockRxDB = () => {
  const mockFindByCursor = vi.fn();
  return {
    entityManager: { getRepository: vi.fn(() => ({ findByCursor: mockFindByCursor })) },
    _mockFindByCursor: mockFindByCursor
  } as unknown as RxDB & { _mockFindByCursor: ReturnType<typeof vi.fn> };
};

const cursorOptions = (
  overrides: Partial<FindByCursorOptions<typeof TestEntity>> = {}
): FindByCursorOptions<typeof TestEntity> =>
  ({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'id', sort: 'asc' }],
    ...overrides
  }) as FindByCursorOptions<typeof TestEntity>;

describe('VERIFY', () => {
  let mockRxDB: RxDB & { _mockFindByCursor: ReturnType<typeof vi.fn> };

  const configureTestBed = (): void => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: RxDB, useValue: mockRxDB }]
    });
  };

  beforeEach(() => {
    mockRxDB = createMockRxDB();
    configureTestBed();
    vi.clearAllMocks();
  });

  it('S1b: reading value() does start the query', () => {
    const subject = new BehaviorSubject({ id: '1', name: 'x' });
    MockEntity.get.mockReturnValue(subject.asObservable());
    TestBed.runInInjectionContext(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = useRepositoryQuery(TestEntity as any, 'get', undefined, { id: '1' });
      r.value();
      TestBed.flushEffects();

      expect(MockEntity.get).toHaveBeenCalledTimes(1);
      expect(MockEntity.get).toHaveBeenCalledWith({ id: '1' });
      // 订阅建立后值必须真的流到 value()，否则「查询已发起」只是空转
      expect(r.value()).toEqual({ id: '1', name: 'x' });
      expect(r.error()).toBeUndefined();
    });
  });

  it('S2b: hasMore one-way (correct ctor arg order)', async () => {
    const subject = new Subject<unknown[]>();
    mockRxDB._mockFindByCursor.mockReturnValue(subject.asObservable());

    let list!: InfiniteScrollingList<typeof TestEntity>;
    TestBed.runInInjectionContext(() => {
      list = new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 3 }));
    });
    TestBed.flushEffects();
    await settle();

    // 首帧不满页
    subject.next([{ id: '1' }, { id: '2' }]);
    await settle();
    expect(list.hasMore()).toBe(false);

    // 活查询回补，同一订阅再 emit 满页 —— hasMore 必须翻回 true，
    // 否则用户在「先短后满」的活查询下永远翻不动页（探针原本只打印不断言）
    subject.next([{ id: '1' }, { id: '2' }, { id: '3' }]);
    await settle();
    expect(list.hasMore()).toBe(true);
    expect(list.value().map(item => (item as { id: string }).id)).toEqual(['1', '2', '3']);

    list.loadMore();
    await settle();

    // 第二页以第一页尾条目为游标
    expect(mockRxDB._mockFindByCursor).toHaveBeenCalledTimes(2);
    const secondCall = mockRxDB._mockFindByCursor.mock.calls[1]?.[0] as { after?: { id: string } };
    expect(secondCall.after?.id).toBe('3');
  });

  it('S3: isEmpty() is false while error is set', async () => {
    const err = new Error('boom');
    mockRxDB._mockFindByCursor.mockReturnValue(throwError(() => err));

    let list!: InfiniteScrollingList<typeof TestEntity>;
    TestBed.runInInjectionContext(() => {
      list = new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 3 }));
    });
    TestBed.flushEffects();
    await settle();

    expect(list.error()).toBe(err);
    // 错误态被当成「暂无数据」的话，UI 只会渲染空状态，用户失去重试入口
    expect(list.isEmpty()).toBe(false);
    expect(list.hasValue()).toBe(false);
    expect(list.isLoading()).toBe(false);
  });

  it('S3b: non-Error thrown by repository is normalized into a real Error', async () => {
    mockRxDB._mockFindByCursor.mockReturnValue(throwError(() => 'string failure'));

    let list!: InfiniteScrollingList<typeof TestEntity>;
    TestBed.runInInjectionContext(() => {
      list = new InfiniteScrollingList(mockRxDB, TestEntity, cursorOptions({ limit: 3 }));
    });
    TestBed.flushEffects();
    await settle();

    const error = list.error();
    // 探针原本打印「instanceof Error = false」却零断言：error 声明为 Error|undefined，
    // 泄漏原始字符串会让消费者读 .message 得到 undefined（RAN-008）
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('string failure');
    expect(list.isLoading()).toBe(false);
  });

  it('S4: same namespace:name returns the same signal', () => {
    localStorage.clear();
    TestBed.runInInjectionContext(() => {
      const a = useState('app')('theme').signal('dark');
      const b = useState('app')('theme').signal('dark');

      // 同键必须复用同一实例，否则两处 UI 各持一份互不可见的状态
      expect(b).toBe(a);

      a.set('light');
      TestBed.flushEffects();
      expect(b()).toBe('light');

      b.set('dark');
      TestBed.flushEffects();
      expect(a()).toBe('dark');
    });
  });

  it('S4b: signal created AFTER a write picks up the persisted value', () => {
    localStorage.clear();
    TestBed.runInInjectionContext(() => {
      const a = useState('app')('theme2').signal('dark');
      a.set('light');
      TestBed.flushEffects();
    });

    // 换一个注入器 = 新一次页面加载：注册表重建，初值只能来自盘上
    TestBed.resetTestingModule();
    configureTestBed();

    TestBed.runInInjectionContext(() => {
      const reloaded = useState('app')('theme2').signal('dark');

      expect(reloaded()).toBe('light');
    });
  });
});

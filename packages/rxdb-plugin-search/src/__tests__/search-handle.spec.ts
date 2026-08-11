import { firstValueFrom, lastValueFrom, take, toArray, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createSearchHandle, type PerformSearch } from '../core/search-handle.js';
import { SearchExecutionError, type SearchResult } from '../types.js';

const res = (id: string, rank = -1): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id,
  rank,
  matchedField: 'title',
  snippet: `snippet-${id}`
});

describe('search-handle (T034)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('setQuery → debounce 300ms → success with results', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('1')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    const state1 = await firstValueFrom(h.state$);
    expect(state1).toBe('idle');
    h.setQuery('foo');
    // 防抖触发前仍为 idle。
    await vi.advanceTimersByTimeAsync(100);
    expect(perform).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform.mock.calls[0].slice(0, 2)).toEqual(['foo', 0]);
    const results = await firstValueFrom(h.results$);
    expect(results).toHaveLength(1);
    expect(await firstValueFrom(h.state$)).toBe('success');
    h.destroy();
  });

  it('empty query after trim → idle, does not call performSearch', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    h.setQuery('   ');
    await vi.advanceTimersByTimeAsync(500);
    expect(perform).not.toHaveBeenCalled();
    expect(await firstValueFrom(h.state$)).toBe('idle');
    h.destroy();
  });

  it('empty results → empty state', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    h.setQuery('nope');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('empty');
    h.destroy();
  });

  it('error state preserves last query; retry() → loading → success', async () => {
    const perform = vi
      .fn<PerformSearch>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ results: [res('1')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('error');
    const err = await firstValueFrom(h.error$);
    expect(err).toBeInstanceOf(SearchExecutionError);
    h.retry();
    await vi.advanceTimersByTimeAsync(50);
    expect(await firstValueFrom(h.state$)).toBe('success');
    expect(perform.mock.calls.at(-1)?.slice(0, 2)).toEqual(['foo', 0]);
    h.destroy();
  });

  it('clear() → idle, resets results', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('1')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('success');
    h.clear();
    expect(await firstValueFrom(h.state$)).toBe('idle');
    expect(await firstValueFrom(h.results$)).toEqual([]);
    h.destroy();
  });

  it('loadMore appends next page when hasMore=true', async () => {
    const perform = vi
      .fn<PerformSearch>()
      .mockResolvedValueOnce({ results: [res('1')], hasMore: true })
      .mockResolvedValueOnce({ results: [res('2')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.results$)).toHaveLength(1);
    await h.loadMore();
    const res2 = await firstValueFrom(h.results$);
    expect(res2.map(r => r.id)).toEqual(['1', '2']);
    expect(perform.mock.calls[1].slice(0, 2)).toEqual(['foo', 1]);
    h.destroy();
  });

  it('公开只读结果与内部分页状态隔离', async () => {
    const perform = vi
      .fn<PerformSearch>()
      .mockResolvedValueOnce({ results: [res('1')], hasMore: true })
      .mockResolvedValueOnce({ results: [res('2')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    expectTypeOf(h.results$).toEqualTypeOf<Observable<readonly Readonly<SearchResult>[]>>();
    expect(Object.isFrozen(await firstValueFrom(h.results$))).toBe(true);

    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    const firstPage = await firstValueFrom(h.results$);
    expect(Object.isFrozen(firstPage)).toBe(true);
    expect(Object.isFrozen(firstPage[0])).toBe(true);
    expect(() => (firstPage as SearchResult[]).push(res('poison'))).toThrow(TypeError);
    expect(() => {
      (firstPage[0] as SearchResult).id = 'poison';
    }).toThrow(TypeError);

    await h.loadMore();
    expect((await firstValueFrom(h.results$)).map(result => result.id)).toEqual(['1', '2']);
    h.destroy();
  });

  it('data-change subscription bypasses debounce', async () => {
    let fire: (() => void) | undefined;
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('1')], hasMore: false });
    const h = createSearchHandle({
      performSearch: perform,
      subscribeDataChanges: onChange => {
        fire = onChange;
        return () => {
          /* 无操作 */
        };
      }
    });
    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    expect(perform).toHaveBeenCalledTimes(1);
    // 模拟数据变化：刷新不应等待 300ms 的输入防抖；
    // 它只需清除更短的 refreshAuditMs 合并窗口。
    fire!();
    await vi.advanceTimersByTimeAsync(100);
    expect(perform).toHaveBeenCalledTimes(2);
    h.destroy();
  });

  it('debounce=0 is pass-through', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [], hasMore: false });
    const h = createSearchHandle({ performSearch: perform, debounceMs: 0 });
    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(1);
    expect(perform).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it('state$ sequence: idle → loading → success on setQuery', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('1')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });
    const collected = lastValueFrom(h.state$.pipe(take(3), toArray()));
    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    expect(await collected).toEqual(['idle', 'loading', 'success']);
    h.destroy();
  });

  it('non-empty initialQuery runs exactly once (no debounced duplicate)', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('1')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform, initialQuery: 'hello' });
    // 推进足够久，让任何「经防抖通道的重复初始查询」都有机会触发
    await vi.advanceTimersByTimeAsync(400);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform.mock.calls[0].slice(0, 2)).toEqual(['hello', 0]);
    expect(await firstValueFrom(h.state$)).toBe('success');
    h.destroy();
  });

  it('clear() abandons in-flight query — stale resolve must not write back results', async () => {
    let resolveFoo: ((page: { results: SearchResult[]; hasMore: boolean }) => void) | undefined;
    const perform = vi.fn<PerformSearch>().mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFoo = resolve;
        })
    );
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400); // 防抖已过，'foo' 请求正在处理中
    expect(perform).toHaveBeenCalledTimes(1);

    h.clear(); // 请求未归，立即清空
    expect(await firstValueFrom(h.state$)).toBe('idle');

    // 旧请求在 clear 的空查询防抖窗口内归来 —— 不得回写
    resolveFoo!({ results: [res('stale')], hasMore: false });
    await vi.advanceTimersByTimeAsync(1);

    expect(await firstValueFrom(h.state$)).toBe('idle');
    expect(await firstValueFrom(h.results$)).toEqual([]);
    h.destroy();
  });

  it('clear() abandons in-flight query — stale rejection must not surface as error', async () => {
    let rejectFoo: ((err: unknown) => void) | undefined;
    const perform = vi.fn<PerformSearch>().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFoo = reject;
        })
    );
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('foo');
    await vi.advanceTimersByTimeAsync(400);
    h.clear();

    rejectFoo!(new Error('boom'));
    await vi.advanceTimersByTimeAsync(1);

    expect(await firstValueFrom(h.state$)).toBe('idle');
    expect(await firstValueFrom(h.error$)).toBeUndefined();
    h.destroy();
  });

  it('单飞执行并在旧查询结算后运行最新查询', async () => {
    const resolvers: Record<string, (page: { results: SearchResult[]; hasMore: boolean }) => void> = {};
    const perform = vi.fn<PerformSearch>().mockImplementation(
      (q: string) =>
        new Promise(resolve => {
          resolvers[q] = resolve;
        })
    );
    const h = createSearchHandle({ performSearch: perform, debounceMs: 0 });

    h.setQuery('A');
    await vi.advanceTimersByTimeAsync(1); // A 正在处理中
    h.setQuery('B');
    await vi.advanceTimersByTimeAsync(1); // B 只进入 trailing 队列

    expect(perform).toHaveBeenCalledTimes(1);
    resolvers['A']({ results: [res('a')], hasMore: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(perform).toHaveBeenCalledTimes(2);
    resolvers['B']({ results: [res('b')], hasMore: false });
    await vi.advanceTimersByTimeAsync(1);

    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['b']);
    h.destroy();
  });
});

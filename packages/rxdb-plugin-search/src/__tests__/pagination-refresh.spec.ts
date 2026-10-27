/**
 * T061 —— 分页与数据变化刷新（纯逻辑）。
 *
 * 行为：
 *  - setQuery → page 0 → success；loadMore → page 1 → 结果追加、无重复
 *  - 数据变更（trigger$ 直通）重跑查询，从 page 0 开始，不会保留旧 page 1 的碎片
 *  - 分页中不应出现同 id 重复
 */
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchHandle, type PerformSearch, type SearchPage } from '../core/search-handle.js';
import type { SearchResult } from '../types.js';

const res = (id: string): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id,
  rank: -1,
  matchedField: 'title',
  snippet: `snip-${id}`
});

describe('Pagination + data-change refresh (T061)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loadMore appends page-1 results without duplicates', async () => {
    const perform = vi.fn<PerformSearch>().mockImplementation(async (_q, page) => {
      if (page === 0) return { results: [res('a'), res('b')], hasMore: true };
      if (page === 1) return { results: [res('c'), res('d')], hasMore: false };
      return { results: [], hasMore: false };
    });
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'b']);
    expect(await firstValueFrom(h.hasMore$)).toBe(true);

    await h.loadMore();
    const all = (await firstValueFrom(h.results$)).map(r => r.id);
    expect(all).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(all).size).toBe(all.length);
    expect(await firstValueFrom(h.hasMore$)).toBe(false);

    h.destroy();
  });

  it('loadMore is a no-op when hasMore=false', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('a')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(perform).toHaveBeenCalledTimes(1);
    await h.loadMore();
    expect(perform).toHaveBeenCalledTimes(1);

    h.destroy();
  });

  it('data-change trigger during pagination resets to page 0, no duplicates', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const perform = vi
      .fn<PerformSearch>()
      .mockImplementationOnce(async () => ({ results: [res('a'), res('b')], hasMore: true })) // q=alpha p0
      .mockImplementationOnce(async () => ({ results: [res('c')], hasMore: false })) // q=alpha p1
      .mockImplementationOnce(async () => ({ results: [res('a'), res('b'), res('z')], hasMore: false })); // trigger → p0 refresh
    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    await h.loadMore();
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'b', 'c']);

    // 数据变化：从第 0 页完整刷新（trigger$ 绕过防抖）。
    expect(onChangeCb).toBeDefined();
    onChangeCb?.();
    // 推进过变更通道的 refreshAuditMs 合并窗口（默认 80ms）
    await vi.advanceTimersByTimeAsync(100);

    const ids = (await firstValueFrom(h.results$)).map(r => r.id);
    expect(ids).toEqual(['a', 'b', 'z']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(await firstValueFrom(h.hasMore$)).toBe(false);

    h.destroy();
  });

  // 慢查询在途时数据变了，第 0 页刷新排进待执行；在途查询结算、success 同步发出时订阅方立刻翻页。
  // 翻页基于的正是要被刷新替换的旧结果 —— 它顶掉刷新的话，刷新被静默丢弃，新一页追加在过期结果上。
  it('a loadMore re-entered from the success emission does not displace a pending page-0 refresh', async () => {
    let onChangeCb: (() => void) | undefined;
    const slow = Promise.withResolvers<SearchPage>();
    const perform = vi
      .fn<PerformSearch>()
      .mockReturnValueOnce(slow.promise) // initialQuery p0（在途）
      .mockResolvedValueOnce({ results: [res('a'), res('z')], hasMore: true }); // 数据变更 → p0 刷新
    const h = createSearchHandle({
      performSearch: perform,
      initialQuery: 'alpha',
      refreshAuditMs: 0,
      subscribeDataChanges: cb => {
        onChangeCb = cb;
        return () => undefined;
      }
    });
    let loadMore: Promise<void> | undefined;
    const subscription = h.state$.subscribe(state => {
      if (state === 'success' && !loadMore) loadMore = h.loadMore();
    });

    onChangeCb?.();
    slow.resolve({ results: [res('a'), res('b')], hasMore: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(perform.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ['alpha', 0],
      ['alpha', 0]
    ]);
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'z']);
    // 被并进刷新的翻页请求随刷新一起结算，调用方不会永远等着
    await expect(loadMore).resolves.toBeUndefined();

    subscription.unsubscribe();
    h.destroy();
  });
});

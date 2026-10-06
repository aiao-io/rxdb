import { describe, expect, it, vi } from 'vitest';
import { createSearchHandle, type PerformSearch } from '../core/search-handle.js';
import type { SearchResult } from '../types.js';

const result: SearchResult = {
  entity: 'Article',
  collection: 'article',
  id: 'first',
  rank: -1,
  matchedField: 'title',
  snippet: 'first'
};

const drainMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

describe('loadMore 结算语义：取消待执行分页必须结算调用方（RV-062 回归）', () => {
  it.each(['clear', 'destroy'] as const)('%s 不遗失同步订阅中排队的 loadMore Promise', async action => {
    const performSearch = vi.fn<PerformSearch>().mockResolvedValue({ results: [result], hasMore: true });
    const handle = createSearchHandle({ performSearch, initialQuery: 'first', refreshAuditMs: 0 });
    let queued = false;
    let settled = false;
    const subscription = handle.state$.subscribe(state => {
      if (state !== 'success' || queued) return;
      queued = true;
      void handle.loadMore().then(() => {
        settled = true;
      });
      handle[action]();
    });
    try {
      await drainMicrotasks();
      expect(queued).toBe(true);
      expect(performSearch).toHaveBeenCalledTimes(1);
      expect(settled).toBe(true);
    } finally {
      subscription.unsubscribe();
      handle.destroy();
    }
  });

  it('未取消时，同一重入位置的分页可以执行并结算', async () => {
    const performSearch = vi
      .fn<PerformSearch>()
      .mockResolvedValueOnce({ results: [result], hasMore: true })
      .mockResolvedValueOnce({ results: [], hasMore: false });
    const handle = createSearchHandle({ performSearch, initialQuery: 'first', refreshAuditMs: 0 });
    let queued = false;
    let settled = false;
    const subscription = handle.state$.subscribe(state => {
      if (state !== 'success' || queued) return;
      queued = true;
      void handle.loadMore().then(() => {
        settled = true;
      });
    });
    try {
      await drainMicrotasks();
      expect(performSearch.mock.calls.map(call => call.slice(0, 2))).toEqual([
        ['first', 0],
        ['first', 1]
      ]);
      expect(settled).toBe(true);
    } finally {
      subscription.unsubscribe();
      handle.destroy();
    }
  });
});

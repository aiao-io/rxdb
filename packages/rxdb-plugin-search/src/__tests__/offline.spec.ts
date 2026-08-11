/**
 * T060 —— Offline-first 回归测试（纯逻辑）。
 *
 * SQLite FTS5 查询完全本地；remote adapter 不可用时不影响 `performSearch` 成功返回。
 * 本用例通过 `createSearchHandle` + 模拟 `performSearch`（代表 local SQLite 执行）
 * 断言远端不可用不会传播到 handle（无 `error$`、状态稳在 `success`）。
 */
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchHandle, type PerformSearch } from '../core/search-handle.js';
import type { SearchResult } from '../types.js';

const res = (id: string): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id,
  rank: -1,
  matchedField: 'title',
  snippet: `snip-${id}`
});

describe('Offline-first (T060)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('performSearch resolves from local FTS5 even when remote sync would fail', async () => {
    // 模拟：所有查询都走本地 SQLite FTS5，远端 adapter 未配置/不可达不影响 handle
    const localOnly: PerformSearch = vi
      .fn<PerformSearch>()
      .mockResolvedValue({ results: [res('a'), res('b')], hasMore: false });
    const h = createSearchHandle({ performSearch: localOnly });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);

    expect(await firstValueFrom(h.state$)).toBe('success');
    expect(await firstValueFrom(h.error$)).toBeUndefined();
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'b']);

    h.destroy();
  });

  it('remote-disconnect-like transient errors do not poison lastQuery; retry() recovers', async () => {
    // 第一次查询因"模拟 IO 干扰"失败，retry 后恢复 —— 契合离线期间的抖动场景
    const perform = vi
      .fn<PerformSearch>()
      .mockRejectedValueOnce(new Error('transient-io'))
      .mockResolvedValue({ results: [res('x')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('error');

    h.retry();
    await vi.advanceTimersByTimeAsync(50);
    expect(await firstValueFrom(h.state$)).toBe('success');
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['x']);

    h.destroy();
  });
});

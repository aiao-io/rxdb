import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchHandle, type PerformSearch } from '../core/search-handle.js';
import { SearchExecutionError, type SearchResult } from '../types.js';

const res = (id: string): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id,
  rank: -1,
  matchedField: 'title',
  snippet: `snip-${id}`
});

describe('retry / clear semantics (T059)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('error state preserves last results and exposes error$ with SearchExecutionError', async () => {
    const perform = vi
      .fn<PerformSearch>()
      .mockResolvedValueOnce({ results: [res('a'), res('b')], hasMore: true })
      .mockRejectedValueOnce(new Error('boom'));
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('success');
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'b']);

    h.setQuery('beta');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('error');
    // 出错前的结果应保留。
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'b']);
    const err = await firstValueFrom(h.error$);
    expect(err).toBeInstanceOf(SearchExecutionError);
    expect(err?.cause).toBeInstanceOf(Error);
    expect((err?.cause as Error).message).toBe('boom');

    h.destroy();
  });

  it('retry() replays last query and clears error$ on success', async () => {
    const perform = vi
      .fn<PerformSearch>()
      .mockRejectedValueOnce(new Error('first-fail'))
      .mockResolvedValueOnce({ results: [res('x')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('error');
    expect(await firstValueFrom(h.error$)).toBeInstanceOf(SearchExecutionError);

    h.retry();
    await vi.advanceTimersByTimeAsync(50);
    expect(await firstValueFrom(h.state$)).toBe('success');
    expect(await firstValueFrom(h.error$)).toBeUndefined();
    expect(perform.mock.calls.at(-1)?.slice(0, 2)).toEqual(['alpha', 0]);

    h.destroy();
  });

  it('retry() is a no-op when not in error state', async () => {
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('x')], hasMore: false });
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('success');
    expect(perform).toHaveBeenCalledTimes(1);

    h.retry();
    await vi.advanceTimersByTimeAsync(50);
    expect(perform).toHaveBeenCalledTimes(1);

    h.destroy();
  });

  it('clear() → idle and resets results / error$ / hasMore$', async () => {
    const perform = vi
      .fn<PerformSearch>()
      .mockResolvedValueOnce({ results: [res('a')], hasMore: true })
      .mockRejectedValueOnce(new Error('boom'));
    const h = createSearchHandle({ performSearch: perform });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.hasMore$)).toBe(true);

    h.setQuery('beta');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('error');
    expect(await firstValueFrom(h.error$)).toBeInstanceOf(SearchExecutionError);

    h.clear();
    expect(await firstValueFrom(h.state$)).toBe('idle');
    expect(await firstValueFrom(h.results$)).toEqual([]);
    expect(await firstValueFrom(h.error$)).toBeUndefined();
    expect(await firstValueFrom(h.hasMore$)).toBe(false);

    h.destroy();
  });
});

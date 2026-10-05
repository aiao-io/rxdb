import { createSearchHandle, SearchExecutionError, type SearchResult } from '@aiao/rxdb-plugin-search';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearch, type SearchSourceLike } from '../index.js';

afterEach(() => TestBed.resetTestingModule());

const bind = (source: SearchSourceLike) => {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const search = TestBed.runInInjectionContext(() => useSearch(source));
  return {
    read: () => ({
      query: search.query(),
      results: search.results(),
      state: search.state(),
      error: search.error(),
      hasMore: search.hasMore()
    }),
    setQuery: (query: string) => search.query.set(query),
    retry: search.retry,
    clear: search.clear,
    loadMore: search.loadMore,
    change: async (action: () => void) => {
      action();
      TestBed.flushEffects();
      await Promise.resolve();
    },
    dispose: () => TestBed.resetTestingModule()
  };
};

const row = (page: number): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id: String(page),
  rank: -page,
  matchedField: 'title',
  snippet: `page-${page}`
});

describe('并行评审：真实核心 SearchHandle 的完整 C1 状态映射', () => {
  it('空词、无结果、失败与重试、分页末页、清空均保留核心语义', async () => {
    const failure = new SearchExecutionError('可恢复的执行失败');
    let fail = true;
    const performSearch = vi.fn(async (query: string, page: number) => {
      if (query === 'broken' && fail) throw failure;
      if (query === 'none') return { results: [], hasMore: false };
      return { results: [row(page)], hasMore: page === 0 };
    });
    const source: SearchSourceLike = {
      search: initialQuery => createSearchHandle({ performSearch, initialQuery, debounceMs: 0 })
    };
    const binding = bind(source);
    try {
      expect(binding.read()).toMatchObject({ query: '', results: [], state: 'idle', error: undefined, hasMore: false });
      await binding.loadMore();
      expect(performSearch).not.toHaveBeenCalled();

      await binding.change(() => binding.setQuery('none'));
      await vi.waitFor(() =>
        expect(binding.read()).toMatchObject({ results: [], state: 'empty', error: undefined, hasMore: false })
      );

      await binding.change(() => binding.setQuery('broken'));
      await vi.waitFor(() => expect(binding.read().state).toBe('error'));
      expect(binding.read().error).toBe(failure);
      fail = false;
      await binding.change(binding.retry);
      await vi.waitFor(() =>
        expect(binding.read()).toMatchObject({ state: 'success', error: undefined, hasMore: true })
      );
      expect(binding.read().results.map(result => result.id)).toEqual(['0']);

      await binding.loadMore();
      await vi.waitFor(() => expect(binding.read().hasMore).toBe(false));
      expect(binding.read().results.map(result => result.id)).toEqual(['0', '1']);
      const callsAtEnd = performSearch.mock.calls.length;
      await binding.loadMore();
      expect(performSearch).toHaveBeenCalledTimes(callsAtEnd);

      await binding.change(binding.clear);
      expect(binding.read()).toMatchObject({ query: '', results: [], state: 'idle', error: undefined, hasMore: false });
    } finally {
      binding.dispose();
    }
  });
});

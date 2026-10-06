import type { SearchExecutionError, SearchHandle, SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useSearch, type SearchSourceLike } from '../use-search.js';

const makeHandle = (): SearchHandle => ({
  results$: new BehaviorSubject<SearchResult[]>([]),
  state$: new BehaviorSubject<SearchState>('idle'),
  error$: new BehaviorSubject<SearchExecutionError | undefined>(undefined),
  hasMore$: new BehaviorSubject(false),
  setQuery: () => undefined,
  clear: () => undefined,
  retry: () => undefined,
  loadMore: () => Promise.resolve(),
  destroy: () => undefined
});

const createSource = () => {
  const search = vi.fn(() => makeHandle());
  const source: SearchSourceLike = { search };
  return { source, search };
};

describe('实际代码评审：Vue search 选项原地变化', () => {
  it('Ref 内 pageSize 原地改变时应重建 handle', async () => {
    const options = ref({ pageSize: 10 });
    const { source, search } = createSource();
    const scope = effectScope();
    scope.run(() => useSearch(source, options));
    try {
      options.value.pageSize = 20;
      await nextTick();
      expect(search).toHaveBeenCalledTimes(2);
    } finally {
      scope.stop();
    }
  });
  it('Ref 内 collections 数组变化时应重建 handle', async () => {
    const options = ref({ collections: ['todo'] });
    const { source, search } = createSource();
    const scope = effectScope();
    scope.run(() => useSearch(source, options));
    try {
      options.value.collections.push('recipes');
      await nextTick();
      expect(search).toHaveBeenCalledTimes(2);
    } finally {
      scope.stop();
    }
  });
  it('替换 Ref 对象的对照路径能正常重建', async () => {
    const options = ref({ pageSize: 10 });
    const { source, search } = createSource();
    const scope = effectScope();
    scope.run(() => useSearch(source, options));
    try {
      options.value = { pageSize: 20 };
      await nextTick();
      expect(search).toHaveBeenCalledTimes(2);
    } finally {
      scope.stop();
    }
  });
});

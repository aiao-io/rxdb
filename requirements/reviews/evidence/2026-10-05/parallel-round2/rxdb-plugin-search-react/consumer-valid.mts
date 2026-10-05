import type { RxDB } from '@aiao/rxdb';
import {
  SearchExecutionError,
  useSearch,
  type SearchHandle,
  type SearchOptions,
  type SearchResult,
  type SearchSourceLike,
  type SearchState,
  type UseSearchReturn
} from '@aiao/rxdb-plugin-search-react';

export function useTypedSearchConsumer(source: SearchSourceLike, options?: SearchOptions): UseSearchReturn {
  const search: UseSearchReturn = useSearch(source, options);
  const query: string = search.query;
  const results: readonly SearchResult[] = search.results;
  const state: SearchState = search.state;
  const error: SearchExecutionError | undefined = search.error;
  const hasMore: boolean = search.hasMore;
  const setQuery: (value: string) => void = search.setQuery;
  const loadMore: () => Promise<void> = search.loadMore;
  const clear: () => void = search.clear;
  const retry: () => void = search.retry;
  void [query, results, state, error, hasMore, setQuery, loadMore, clear, retry];
  return search;
}

export function useDatabaseSearchConsumer(database: RxDB, options: SearchOptions): UseSearchReturn {
  const source: SearchSourceLike = database;
  return useSearch(source, options);
}

export function acceptPublicHandle(handle: SearchHandle): SearchSourceLike {
  return { search: (_query: string, _options?: SearchOptions): SearchHandle => handle };
}

export function narrowExecutionError(search: UseSearchReturn): string | undefined {
  return search.error instanceof SearchExecutionError ? search.error.message : undefined;
}

import {
  useSearch,
  type SearchOptions,
  type SearchSourceLike,
  type SearchState,
  type UseSearchReturn
} from '@aiao/rxdb-plugin-search-react';

export function useInvalidSearchConsumer(source: SearchSourceLike): UseSearchReturn {
  const invalidSource: SearchSourceLike = { search: (_query: string) => Promise.resolve([]) };
  const invalidOptions: SearchOptions = { debounce: 'fast', collections: [123] };
  const search: UseSearchReturn = useSearch(source, invalidOptions);
  search.setQuery(123);
  const results: string[] = search.results;
  const state: SearchState = 'cancelled';
  const loadMore: () => Promise<string> = search.loadMore;
  void [invalidSource, results, state, loadMore];
  return search;
}

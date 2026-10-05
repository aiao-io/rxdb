import { useSearch, type SearchSourceLike, type SearchState, type UseSearchReturn } from '@aiao/rxdb-plugin-search-vue';
import { computed, ref } from 'vue';

export function rejectInvalidConsumer(source: SearchSourceLike) {
  useSearch(42);
  useSearch({ search: () => 'not a SearchHandle' });
  useSearch(computed(() => 'not a SearchSourceLike'));
  useSearch(source, { debounce: 'fast', pageSize: 'two', collections: [1] });
  useSearch(source, ref({ snippetLength: 'short' }));
  const result: UseSearchReturn = useSearch(source);
  result.query.value = 42;
  result.results.value = [];
  result.state.value = 'success';
  result.error.value = undefined;
  result.hasMore.value = false;
  const state: SearchState = 'cancelled';
  const pending: number = result.loadMore();
  return { state, pending };
}

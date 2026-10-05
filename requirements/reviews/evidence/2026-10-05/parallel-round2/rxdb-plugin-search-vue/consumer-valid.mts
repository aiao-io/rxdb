import { createSearchHandle } from '@aiao/rxdb-plugin-search';
import {
  SearchExecutionError,
  useSearch,
  type SearchHandle,
  type SearchOptions,
  type SearchResult,
  type SearchSourceLike,
  type SearchState,
  type UseSearchReturn
} from '@aiao/rxdb-plugin-search-vue';
import { computed, effectScope, readonly, ref, shallowRef, type Ref } from 'vue';

export const source: SearchSourceLike = {
  search(query, options): SearchHandle {
    return createSearchHandle({
      initialQuery: query,
      debounceMs: options?.debounce ?? 0,
      performSearch: async value => ({
        results: [
          { entity: 'Article', collection: 'article', id: value, rank: -1, matchedField: 'title', snippet: value }
        ],
        hasMore: false
      })
    });
  }
};

export function createConsumer() {
  const scope = effectScope();
  const sourceRef = shallowRef<SearchSourceLike>(source);
  const optionsRef = ref<SearchOptions>({
    initialQuery: 'article',
    debounce: 0,
    pageSize: 2,
    collections: ['article']
  });
  const result = scope.run(() => {
    const direct: UseSearchReturn = useSearch(source, { pageSize: 2 });
    const refInput: UseSearchReturn = useSearch(sourceRef, optionsRef);
    const readonlyInput: UseSearchReturn = useSearch(readonly(sourceRef), readonly(optionsRef));
    const computedInput: UseSearchReturn = useSearch(
      computed(() => sourceRef.value),
      computed(() => optionsRef.value)
    );
    const getterInput: UseSearchReturn = useSearch(
      () => sourceRef.value,
      () => optionsRef.value
    );
    const optionalInput: UseSearchReturn = useSearch(
      source,
      computed<SearchOptions | undefined>(() => undefined)
    );
    const query: Ref<string> = direct.query;
    const results: Readonly<Ref<readonly SearchResult[]>> = direct.results;
    const state: Readonly<Ref<SearchState>> = direct.state;
    const error: Readonly<Ref<SearchExecutionError | undefined>> = direct.error;
    const hasMore: Readonly<Ref<boolean>> = direct.hasMore;
    const loadMore: () => Promise<void> = direct.loadMore;
    const clear: () => void = direct.clear;
    const retry: () => void = direct.retry;
    query.value = 'next article';
    const snapshot: SearchState = state.value;
    const failure: SearchExecutionError | undefined = error.value;
    const runtimeError: Error = new SearchExecutionError('consumer failure');
    return {
      direct,
      refInput,
      readonlyInput,
      computedInput,
      getterInput,
      optionalInput,
      query,
      results,
      state,
      error,
      hasMore,
      loadMore,
      clear,
      retry,
      snapshot,
      failure,
      runtimeError
    };
  });
  if (!result) throw new Error('consumer 必须在活动 scope 内建立');
  return { ...result, sourceRef, optionsRef, stop: () => scope.stop() };
}

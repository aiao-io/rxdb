import {
  SearchExecutionError,
  useSearch,
  type SearchHandle,
  type SearchOptions,
  type SearchResult,
  type SearchSourceLike,
  type SearchState,
  type UseSearchReturn
} from '@aiao/rxdb-plugin-search-angular';
import type { Signal, WritableSignal } from '@angular/core';

export function sourceFromHandle(handle: SearchHandle): SearchSourceLike {
  return { search: (_query: string, _options?: SearchOptions) => handle };
}

export function bindInInjectionContext(
  source: SearchSourceLike | Signal<SearchSourceLike>,
  options?: SearchOptions | Signal<SearchOptions | undefined>
): UseSearchReturn {
  return useSearch(source, options);
}

export function consumeBinding(binding: UseSearchReturn): Promise<void> {
  const query: WritableSignal<string> = binding.query;
  const results: Signal<readonly SearchResult[]> = binding.results;
  const state: Signal<SearchState> = binding.state;
  const error: Signal<SearchExecutionError | undefined> = binding.error;
  const hasMore: Signal<boolean> = binding.hasMore;
  query.set('angular');
  const snapshot: readonly SearchResult[] = results();
  const currentState: SearchState = state();
  const currentError: SearchExecutionError | undefined = error();
  const more: boolean = hasMore();
  void snapshot;
  void currentState;
  void more;
  if (currentError instanceof SearchExecutionError) binding.retry();
  binding.clear();
  return binding.loadMore();
}

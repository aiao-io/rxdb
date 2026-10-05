import {
  useSearch,
  type SearchHandle,
  type SearchSourceLike,
  type UseSearchReturn
} from '@aiao/rxdb-plugin-search-angular';

declare const handle: SearchHandle;
declare const source: SearchSourceLike;
declare const binding: UseSearchReturn;

export const invalidHandle: SearchHandle = { ...handle, loadMore: () => 1 };

export function bindWithInvalidSource(): UseSearchReturn {
  return useSearch({ search: () => 1 });
}

export function bindWithInvalidOptions(): UseSearchReturn {
  return useSearch(source, { pageSize: 'ten' });
}

export function writeInvalidQuery(): void {
  binding.query.set(42);
}

export const invalidReturn: Promise<number> = binding.loadMore();

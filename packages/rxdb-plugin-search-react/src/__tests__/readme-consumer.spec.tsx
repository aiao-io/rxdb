import type { RxDB } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { describe, expect, it } from 'vitest';
import { useSearch, type UseSearchReturn } from '../index.js';

async function startSearch(database: RxDB): Promise<void> {
  database.use(rxDBPluginSearch, { debounce: 200, pageSize: 20 });
  await database.connect('sqlite-wasm');
  await database.searchPlugin.ready;
}

function SearchPage({ database }: { readonly database: RxDB }) {
  const search: UseSearchReturn = useSearch(database, {
    collections: ['Article'],
    initialQuery: ''
  });

  return (
    <main>
      <label>
        Search
        <input value={search.query} onChange={event => search.setQuery(event.currentTarget.value)} />
      </label>
      {search.error && <p role='alert'>{search.error.message}</p>}
      {search.state === 'error' && <button onClick={search.retry}>Retry</button>}
      <ul>
        {search.results.map(result => (
          <li key={`${result.collection}:${result.id}`}>{result.snippet}</li>
        ))}
      </ul>
      {search.hasMore && <button onClick={() => void search.loadMore()}>Load more</button>}
      <button onClick={search.clear}>Clear</button>
    </main>
  );
}

describe('README strict consumer', () => {
  it('keeps the documented bootstrap and component signatures compilable', () => {
    expect(startSearch).toBeTypeOf('function');
    expect(SearchPage).toBeTypeOf('function');
  });
});

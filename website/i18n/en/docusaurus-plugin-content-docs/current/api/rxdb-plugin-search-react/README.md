# rxdb-plugin-search-react

The React integration layer for [`@aiao/rxdb-plugin-search`](../rxdb-plugin-search/README.md). Provides the `useSearch()` hook, which adapts the search plugin's `SearchHandle` into a React state consumption interface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-plugin-search-react react rxjs
```

## Usage

```tsx
import type { RxDB } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { useSearch, type UseSearchReturn } from '@aiao/rxdb-plugin-search-react';

export async function startSearch(database: RxDB): Promise<void> {
  database.use(rxDBPluginSearch, { debounce: 200, pageSize: 20 });
  await database.connect('sqlite-wasm');
  await database.searchPlugin.ready;
}

export function SearchPage({ database }: { readonly database: RxDB }) {
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
      `{search.error && <p role="alert">{search.error.message}</p>}`
      `{search.state === 'error' && <button onClick={search.retry}>Retry</button>}`
      <ul>
        {search.results.map(result => (
          <li key={`${result.collection}:${result.id}`}>{result.snippet}</li>
        ))}
      </ul>
      `{search.hasMore && <button onClick={() => void search.loadMore()}>Load more</button>}`
      <button onClick={search.clear}>Clear</button>
    </main>
  );
}
```

`startSearch()` must complete before rendering `SearchPage`. The plugin declares `inject: ['adapter:local']`, so the host installs it only after the local
adapter is ready; therefore FTS is already installed by the time `await connect()` returns. `database.searchPlugin.ready`
is an explicit confirmation of "is it installed" — it resolves on success, rejects with the original error on failure, and rejects with `destroyed` after the epoch is released (disconnect / rollback).
It is one per connection epoch, so it must be read again after reconnecting; it cannot be treated as an always-successful probe.

`useSearch` returns `UseSearchReturn`. The hook owns the `SearchHandle` and automatically
calls `destroy()` when the component unmounts or is rebuilt; callers should not destroy the underlying handle again.

### Rebuild contract (consistent across all three frameworks)

When `source` changes, or any of `options`'s `collections` / `debounce` / `pageSize` / `snippetLength`
changes, the old `SearchHandle` is destroyed and a new handle is seeded with the **user's current query**:

- `initialQuery` only acts as a seed **at first creation** and does not participate in the rebuild criteria afterwards,
  so passing `initialQuery: query` does not rebuild the handle on every keystroke;
- `options` are compared semantically (rather than by reference), so a new object literal produced by each render does not trigger a rebuild;
- after a rebuild, `loadMore` / `clear` / `retry` are always routed to the latest handle, and late emissions from the old handle no longer write to the output.

The criteria are shared across all three frameworks via core's `searchOptionsEqual`, so rebuild timing never differs by framework.

Symmetric functionality across the three frameworks: Angular uses `useSearch` ([`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular/README.md)), Vue uses `useSearch` ([`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue/README.md)).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for framework integration and search guides

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Classes

| Class | Description |
| ------ | ------ |
| [SearchExecutionError](classes/SearchExecutionError.md) | Runtime execution error (SQL failure / storage unavailable); recoverable via [SearchHandle.retry](interfaces/SearchHandle.md#retry). |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [SearchHandle](interfaces/SearchHandle.md) | The reactive handle returned by `collection.search()` / `rxDB.search()`. |
| [SearchOptions](interfaces/SearchOptions.md) | Adjustable parameters for a single search request; can override the [SearchPluginOptions](../rxdb-plugin-search/interfaces/SearchPluginOptions.md) global defaults. |
| [SearchResult](interfaces/SearchResult.md) | A single search hit. |
| [SearchSourceLike](interfaces/SearchSourceLike.md) | The minimal data source shape exposing a `search()` method (`RxDB` / `RxCollection`). |
| [UseSearchReturn](interfaces/UseSearchReturn.md) | Return value of [useSearch](functions/useSearch.md). |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [SearchState](type-aliases/SearchState.md) | The five states of the `SearchHandle` state machine. |

## Functions

| Function | Description |
| ------ | ------ |
| [useSearch](functions/useSearch.md) | Adapts the reactive outputs of a `SearchHandle` into a React hook. |

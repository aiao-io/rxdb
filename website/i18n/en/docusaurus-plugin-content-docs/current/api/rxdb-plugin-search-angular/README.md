# rxdb-plugin-search-angular

The Angular integration layer for [`@aiao/rxdb-plugin-search`](../rxdb-plugin-search/README.md). Provides `useSearch()`, which adapts the search plugin's `SearchHandle` into an Angular signal consumption interface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-plugin-search-angular @angular/core rxjs
```

## Usage

```typescript
import { Component, input } from '@angular/core';
import type { RxDB } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { useSearch, type UseSearchReturn } from '@aiao/rxdb-plugin-search-angular';

export async function startSearch(database: RxDB): Promise<void> {
  database.use(rxDBPluginSearch, { debounce: 200, pageSize: 20 });
  await database.connect('sqlite-wasm');
  await database.searchPlugin.ready;
}

@Component({
  selector: 'app-search-page',
  template: `
    <label>
      Search
      <input [value]="search.query()" (input)="search.query.set($any($event.target).value)" />
    </label>
    @if (search.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
    <ul>
      @for (result of search.results(); track result.collection + ':' + result.id) {
        <li>{{ result.snippet }}</li>
      }
    </ul>
    @if (search.hasMore()) {
      <button (click)="search.loadMore()" type="button">Load more</button>
    }
    <button (click)="search.retry()" type="button">Retry</button>
    <button (click)="search.clear()" type="button">Clear</button>
  `
})
export class SearchPage {
  readonly database = input.required<RxDB>();
  readonly search: UseSearchReturn = useSearch(this.database, {
    collections: ['Article'],
    initialQuery: ''
  });
}
```

`startSearch()` must complete before creating `SearchPage`. The plugin declares `inject: ['adapter:local']`, so the host installs it only after the local
adapter is ready; therefore FTS is already installed by the time `await connect()` returns. `database.searchPlugin.ready`
is an explicit confirmation of "is it installed" — it resolves on success, rejects with the original error on failure, and rejects with `destroyed` after the epoch is released (disconnect / rollback).
It is one per connection epoch, so it must be read again after reconnecting.

`useSearch` returns `UseSearchReturn`. The binding layer holds the underlying `SearchHandle` and automatically
calls `destroy()` when the component is destroyed or the input is rebuilt; callers should not destroy the handle again.

### Signal inputs and the rebuild contract (consistent across all three frameworks)

Both `source` and `options` accept plain values or `Signal`s. When the resolved value changes, the old `SearchHandle` is destroyed and
a new handle is seeded with the **user's current query**:

- `initialQuery` only acts as a seed **at first creation** and does not participate in the rebuild criteria afterwards,
  so passing `initialQuery: query()` does not rebuild the handle on every keystroke;
- `options` are compared semantically (`collections` / `debounce` / `pageSize` / `snippetLength`) rather than by reference,
  so a new object literal produced by each recomputation does not trigger a rebuild;
- after a rebuild, `loadMore` / `clear` / `retry` are always routed to the latest handle, and late emissions from the old handle no longer write to the signal;
- the old handle is `destroy()`ed by the rebuild path itself and does not pile up on the `DestroyRef`.

The criteria are shared across all three frameworks via core's `searchOptionsEqual`, so rebuild timing never differs by framework.

Symmetric functionality across the three frameworks: React uses `useSearch` ([`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react/README.md)), Vue uses `useSearch` ([`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue/README.md)).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for framework integration and search guides

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-search-angular - Angular integration layer

Provides `useSearch()`, which adapts `@aiao/rxdb-plugin-search`'s `SearchHandle` into an Angular signal
consumption interface. Naming is consistent with the React / Vue binding layers.

## Classes

| Class                                                   | Description                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [SearchExecutionError](classes/SearchExecutionError.md) | Runtime execution error (SQL failure / storage unavailable); recoverable via [SearchHandle.retry](interfaces/SearchHandle.md#retry). |

## Interfaces

| Interface                                          | Description                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [SearchHandle](interfaces/SearchHandle.md)         | The reactive handle returned by `collection.search()` / `rxDB.search()`.                                                                                            |
| [SearchOptions](interfaces/SearchOptions.md)       | Adjustable parameters for a single search request; can override the [SearchPluginOptions](../rxdb-plugin-search/interfaces/SearchPluginOptions.md) global defaults. |
| [SearchResult](interfaces/SearchResult.md)         | A single search hit.                                                                                                                                                |
| [SearchSourceLike](interfaces/SearchSourceLike.md) | The minimal data source shape exposing a `search()` method (`RxDB` / `RxCollection`).                                                                               |
| [UseSearchReturn](interfaces/UseSearchReturn.md)   | Return value of [useSearch](functions/useSearch.md).                                                                                                                |

## Type Aliases

| Type Alias                                 | Description                                          |
| ------------------------------------------ | ---------------------------------------------------- |
| [SearchState](type-aliases/SearchState.md) | The five states of the `SearchHandle` state machine. |

## Functions

| Function                            | Description                                                           |
| ----------------------------------- | --------------------------------------------------------------------- |
| [useSearch](functions/useSearch.md) | Adapts the reactive outputs of a `SearchHandle` into Angular signals. |

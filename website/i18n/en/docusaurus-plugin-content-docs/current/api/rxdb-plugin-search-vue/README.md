# rxdb-plugin-search-vue

The Vue integration layer of [`@aiao/rxdb-plugin-search`](../rxdb-plugin-search/README.md). Provides the `useSearch()` composable that adapts the search plugin's `SearchHandle` into a Vue `ref` / reactive consumption interface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-plugin-search-vue vue rxjs
```

## Usage

```vue
<script lang="ts" setup>
import { useSearch } from '@aiao/rxdb-plugin-search-vue';
</script>
```

- `useSearch`: returns a reactive `SearchState` (results, loading state, and errors)
- Types: `UseSearchReturn`, `SearchSourceLike`

Install the plugin and connect before mounting components: `database.use(rxDBPluginSearch, …)` → `await database.connect('sqlite-wasm')`. The plugin declares `inject: ['adapter:local']`; the host only installs it after the local adapter is ready, so by the time `await connect()` returns
FTS is already installed. `database.searchPlugin.ready` is the explicit confirmation of "is it installed" — resolves on successful install, rejects the original
error on failure, and rejects `destroyed` after the epoch is released (disconnect / rollback). It is one slot per connection epoch; re-read it after reconnecting.

### Reactive inputs and the rebuild contract (same across all three frameworks)

Both `source` and `options` accept `MaybeRefOrGetter` (value / `Ref` / `ComputedRef` / getter).
When a resolved value changes, the old `SearchHandle` is destroyed and a new handle is seeded with the **user's current query**:

- `initialQuery` seeds **only at first creation** and no longer takes part in the rebuild criteria afterwards,
  so passing `initialQuery: query` does not rebuild the handle on every keystroke;
- `options` are compared by semantics (`collections` / `debounce` / `pageSize` / `snippetLength`) rather than by reference;
  a literal recreated on every recomputation does not trigger a rebuild;
- After a rebuild, `loadMore` / `clear` / `retry` all route to the latest handle, and late emissions from the old handle no longer write into the output.

The criteria are shared across all three frameworks via core's `searchOptionsEqual`; rebuild timing never differs by framework.

Symmetric functionality across all three frameworks: Angular uses `useSearch` ([`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular/README.md)), React uses `useSearch` ([`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react/README.md)).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project docs site for framework integration and search guides

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-search-vue - Vue integration layer

Provides the `useSearch()` composable that adapts `@aiao/rxdb-plugin-search`'s `SearchHandle` into a Vue
`ref` / reactive consumption interface.

## Classes

| Class | Description |
| ------ | ------ |
| [SearchExecutionError](classes/SearchExecutionError.md) | Runtime execution error (SQL failure / storage unavailable); recoverable via [SearchHandle.retry](interfaces/SearchHandle.md#retry). |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [SearchHandle](interfaces/SearchHandle.md) | The reactive handle returned by `collection.search()` / `rxDB.search()`. |
| [SearchOptions](interfaces/SearchOptions.md) | Tunable parameters of a single search request; can override the [SearchPluginOptions](../rxdb-plugin-search/interfaces/SearchPluginOptions.md) global defaults. |
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
| [useSearch](functions/useSearch.md) | Adapts the reactive output of `SearchHandle` into a Vue composable. |

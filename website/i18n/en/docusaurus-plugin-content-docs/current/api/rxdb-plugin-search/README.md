# rxdb-plugin-search

The global search plugin for `@aiao/rxdb`. Provides reactive full-text search
for collections whose fields are marked `searchable: true` — FTS5 on SQLite,
`tsvector` / GIN on PGlite.

> **Adapter support surface** is decided by the registry in `backend-registry.ts`:
> `sqlite-wasm` / `sqlite` / `sqliteai` / `pglite` are `supported`;
> `wa-sqlite` and mini-programs are `unverified` (**experimental**, the npm
> precompiled wasm does not compile in FTS5), and like unregistered adapters
> they throw `SearchUnsupportedAdapterError` at the `createRxDatabase` stage, with no fallback.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-search @aiao/rxdb-adapter-sqlite-wasm rxjs
```

## Usage

```typescript
import { firstValueFrom } from 'rxjs';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

db.use(rxDBPluginSearch, {
  debounce: 300,
  pageSize: 50,
  snippetLength: 120
});

// connect() triggers init() synchronously; the plugin then finishes the FTS install and backfill.
await db.connect('sqlite-wasm');
await db.searchPlugin.ready;

const handle = db.search('local first', { collections: ['Article'] });
const results = await firstValueFrom(handle.results$);

handle.destroy();
await db.disconnect('sqlite-wasm');
```

`db.searchPlugin.ready` is one slot per connection epoch: before `connect()` and
during installation it is **pending**; a successful installation resolves, a
failure rejects (with the original error), and after the epoch is released
(disconnect / rollback) it rejects `destroyed`. Its reference can be obtained
before `connect()` — that slot is reused by this epoch's installation; but
holding the same reference across a disconnect reads the result of **that
epoch**, so re-read it after reconnecting.

The `SearchHandle` returned by `db.search()` is the caller's responsibility to
`destroy()`; the Angular, React, and Vue bindings destroy it automatically at
the end of the component lifecycle.

## Connection epochs

The plugin declares `inject: ['adapter:local']`, and the host decides the
mounting moment: `install()` is only called after the local adapter's bootstrap
chain finishes, and the plugin no longer waits for a connection signal itself.
So by the time `await db.connect()` returns, FTS is already installed — `ready`
is an explicit confirmation of "installed or not / installation failed or not",
not a required waiting point.

Entity event listeners and state reset are registered on the scope received by
`install(scope)`. The plugin declares `lifecycle: 'scoped'`; releasing the scope
is the host's whole teardown, with no second `destroy()` step. The plugin
identity `db.searchPlugin` survives across epochs; a new `connect()` reuses the
same instance and reinstalls FTS.

Framework bindings: Angular uses [`@aiao/rxdb-plugin-search-angular`](../rxdb-plugin-search-angular/README.md),
React uses [`@aiao/rxdb-plugin-search-react`](../rxdb-plugin-search-react/README.md),
Vue uses [`@aiao/rxdb-plugin-search-vue`](../rxdb-plugin-search-vue/README.md).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- Plugin guides live on the project documentation site

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-search - the RxDB global search plugin

Provides reactive full-text search for collections whose fields are marked `searchable: true`.

## Remarks

The concrete full-text engine is decided by the current adapter, see
[SEARCH\_BACKEND\_DESCRIPTORS](variables/SEARCH_BACKEND_DESCRIPTORS.md): the
SQLite family (`sqlite-wasm` / `sqlite` / `sqliteai`) uses FTS5 external-content
virtual tables, and `pglite` uses PostgreSQL materialized `tsvector` columns +
GIN indexes. Unregistered adapters, or adapters registered as awaiting
verification, fail fast at the database creation stage with a discriminable reason.

## Classes

| Class                                                                     | Description                                                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RxDBPluginSearch](classes/RxDBPluginSearch.md)                           | The main class of `@aiao/rxdb-plugin-search`.                                                                                                                                         |
| [SearchBackendCapabilityError](classes/SearchBackendCapabilityError.md)   | The backend resolved from the adapter name is correct, but the **live connection** lacks the storage capability the backend requires.                                                 |
| [SearchEncryptedFieldError](classes/SearchEncryptedFieldError.md)         | A field declares both `encrypted: true` and `searchable: true`.                                                                                                                       |
| [SearchError](classes/SearchError.md)                                     | The error base class of `@aiao/rxdb-plugin-search`.                                                                                                                                   |
| [SearchExecutionError](classes/SearchExecutionError.md)                   | Runtime execution error (SQL failure / storage unavailable); recoverable via [SearchHandle.retry](interfaces/SearchHandle.md#retry).                                                  |
| [SearchQueryLimitError](classes/SearchQueryLimitError.md)                 | Runtime execution error (SQL failure / storage unavailable); recoverable via [SearchHandle.retry](interfaces/SearchHandle.md#retry).                                                  |
| [SearchSchemaMismatchError](classes/SearchSchemaMismatchError.md)         | The FTS5 migration signature conflicts with the current schema; thrown at startup, blocking the mount.                                                                                |
| [SearchUnsupportedAdapterError](classes/SearchUnsupportedAdapterError.md) | The current database's adapter cannot map to any search backend; fails fast at the `createRxDatabase` stage, the plugin does not mount `.search`, and no degraded Handle is returned. |

## Interfaces

| Interface                                                            | Description                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [CreateSearchHandleOptions](interfaces/CreateSearchHandleOptions.md) | SearchHandle factory configuration.                                                                                                         |
| [FtsInstallPlan](interfaces/FtsInstallPlan.md)                       | The FTS5 installation plan of a single entity                                                                                               |
| [InstallFtsResult](interfaces/InstallFtsResult.md)                   | The installation result of a single entity.                                                                                                 |
| [InvalidSearchableField](interfaces/InvalidSearchableField.md)       | Schema validation failure details.                                                                                                          |
| [MigrationRecordStore](interfaces/MigrationRecordStore.md)           | Migration record access abstraction. The plugin does not directly depend on the `RxDBMigration` entity, easing unit testing and reuse.      |
| [ResolveScopeInput](interfaces/ResolveScopeInput.md)                 | Resolves the collection range participating in aggregation.                                                                                 |
| [RuntimeSqlExecutor](interfaces/RuntimeSqlExecutor.md)               | The atomic SQL execution interface, shaped like `RxDBAdapterSqliteBase.rawQuery` of `@aiao/rxdb-adapter-sqlite-core`.                       |
| [SearchBackend](interfaces/SearchBackend.md)                         | The complete implementation of one full-text search backend.                                                                                |
| [SearchBackendCapabilities](interfaces/SearchBackendCapabilities.md) | The capability set **self-declared** by the backend.                                                                                        |
| [SearchBackendDescriptor](interfaces/SearchBackendDescriptor.md)     | The registration entry of a single adapter.                                                                                                 |
| [SearchEngine](interfaces/SearchEngine.md)                           | The engine handle returned by `createSearchEngine(...)`.                                                                                    |
| [SearchEngineQuery](interfaces/SearchEngineQuery.md)                 | The input of `createSearchEngine().search(...)`.                                                                                            |
| [SearchHandle](interfaces/SearchHandle.md)                           | The reactive handle returned by `collection.search()` / `rxDB.search()`.                                                                    |
| [SearchOptions](interfaces/SearchOptions.md)                         | The adjustable parameters of one search request; can override the [SearchPluginOptions](interfaces/SearchPluginOptions.md) global defaults. |
| [SearchPage](interfaces/SearchPage.md)                               | One page of query results + whether there is a next page.                                                                                   |
| [SearchPluginOptions](interfaces/SearchPluginOptions.md)             | The initialization options of `rxDBPluginSearch(options)`.                                                                                  |
| [SearchResult](interfaces/SearchResult.md)                           | One search hit.                                                                                                                             |
| [SearchSourceLike](interfaces/SearchSourceLike.md)                   | The minimal data-source shape exposing a `search()` method (`RxDB` / `RxCollection`).                                                       |
| [SearchStateSnapshot](interfaces/SearchStateSnapshot.md)             | The state machine's internal snapshot (with all observable derived fields).                                                                 |

## Type Aliases

| Type Alias                                                   | Description                                                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [FtsExecutor](type-aliases/FtsExecutor.md)                   | The SQL execution adapter: takes parameterized SQL and returns FTS rows.                                                                      |
| [PerformSearch](type-aliases/PerformSearch.md)               | The "really do the work" function injected by plugin.ts: given query terms and a page number, returns that page's results.                    |
| [SearchBackendId](type-aliases/SearchBackendId.md)           | The identifiers of implemented search backends.                                                                                               |
| [SearchBackendStatus](type-aliases/SearchBackendStatus.md)   | Registration status.                                                                                                                          |
| [SearchQueryLimitKind](type-aliases/SearchQueryLimitKind.md) | The query compilation budget is exceeded; no SQL is executed, observable via error$, and the caller can prompt the user to shorten the input. |
| [SearchState](type-aliases/SearchState.md)                   | The five states of the `SearchHandle` state machine.                                                                                          |
| [SearchStateMachine](type-aliases/SearchStateMachine.md)     | The return type of `createSearchState`; can be referenced by structure in `SearchHandle` implementations.                                     |

## Variables

| Variable                                                                 | Description                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [FULL\_SEARCH\_CAPABILITIES](variables/FULL_SEARCH_CAPABILITIES.md)      | Both backends currently implement all capabilities; extracted as a constant to avoid drift from each repeating literals. |
| [MAX\_CONTAINS\_FALLBACK\_ROWS](variables/MAX_CONTAINS_FALLBACK_ROWS.md) | The unindexed contains fallback is not run when the source table's row count exceeds this.                               |
| [MAX\_QUERY\_LENGTH](variables/MAX_QUERY_LENGTH.md)                      | The maximum UTF-16 code units of a raw query, bounding compilation and FTS expression memory growth.                     |
| [MAX\_QUERY\_TOKENS](variables/MAX_QUERY_TOKENS.md)                      | The maximum tokens kept per query, far below SQLite's hard bind / expression limits.                                     |
| [MAX\_TOKEN\_LENGTH](variables/MAX_TOKEN_LENGTH.md)                      | The maximum UTF-16 code units of one token, avoiding overly long phrases crushing the FTS tokenizer.                     |
| [rxDBPluginSearch](variables/rxDBPluginSearch.md)                        | The plugin factory; same shape as `rxDBPluginTrigger`.                                                                   |
| [SEARCH\_BACKEND\_DESCRIPTORS](variables/SEARCH_BACKEND_DESCRIPTORS.md)  | All registration entries.                                                                                                |
| [SEARCHABLE\_PROPERTY\_TYPES](variables/SEARCHABLE_PROPERTY_TYPES.md)    | -                                                                                                                        |

## Functions

| Function                                                                      | Description                                                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [assertSearchableSchemaValid](functions/assertSearchableSchemaValid.md)       | Aggregating validation: throws on any illegal field, otherwise passes silently.                                                                 |
| [buildBackfillSql](functions/buildBackfillSql.md)                             | Backfill SQL: external-content FTS5 tables bind the primary key via rowid; stringArray fields go through json_each subqueries.                  |
| [buildFieldContainsSql](functions/buildFieldContainsSql.md)                   | Single-field contains fallback SQL.                                                                                                             |
| [buildFieldMatchExpression](functions/buildFieldMatchExpression.md)           | FTS5 column filter expression: `<field> : (<compiled.match>)`                                                                                   |
| [buildFieldSearchSql](functions/buildFieldSearchSql.md)                       | Single-field search SQL.                                                                                                                        |
| [buildResetFtsSql](functions/buildResetFtsSql.md)                             | The FTS5 virtual table reset command: clears the index but keeps the table structure.                                                           |
| [buildSourceRowCountSql](functions/buildSourceRowCountSql.md)                 | The row-count budget probe before the contains fallback.                                                                                        |
| [collectInvalidSearchableFields](functions/collectInvalidSearchableFields.md) | Scans entity metadata for all fields explicitly marked `searchable: true`, collecting entries with illegal types (not string/enum/stringArray). |
| [createFts5Backend](functions/createFts5Backend.md)                           | Constructs the SQLite FTS5 backend.                                                                                                             |
| [createPgTsvectorBackend](functions/createPgTsvectorBackend.md)               | Constructs the PostgreSQL tsvector backend.                                                                                                     |
| [createSearchBackend](functions/createSearchBackend.md)                       | Constructs a backend instance by backend identifier.                                                                                            |
| [createSearchEngine](functions/createSearchEngine.md)                         | Constructs a `SearchEngine`, binding an SQL executor.                                                                                           |
| [createSearchHandle](functions/createSearchHandle.md)                         | Assembles a [SearchHandle](interfaces/SearchHandle.md). Callers only care about the state stream and lifecycle management.                      |
| [createSearchState](functions/createSearchState.md)                           | Creates a brand-new search state machine.                                                                                                       |
| [installFtsForEntity](functions/installFtsForEntity.md)                       | Runs the FTS5 installation of a single entity; idempotent.                                                                                      |
| [lookupSearchBackendDescriptor](functions/lookupSearchBackendDescriptor.md)   | Looks up a registration entry.                                                                                                                  |
| [resolveSearchBackend](functions/resolveSearchBackend.md)                     | Resolves the search backend of the current adapter; throws when unavailable.                                                                    |
| [resolveSearchScope](functions/resolveSearchScope.md)                         | Computes the final collection name list participating in the search aggregation (same order as `candidates`, de-duplicated).                    |
| [searchOptionsEqual](functions/searchOptionsEqual.md)                         | Determines whether two [SearchOptions](interfaces/SearchOptions.md) are equivalent **in the sense of rebuilding a `SearchHandle`**.             |

# @aiao/rxdb-plugin-search

`@aiao/rxdb-plugin-search` provides a **unified global full-text search entry** for `@aiao/rxdb`, built on SQLite FTS5 external content tables and sync triggers: fields marked `searchable: true` stay index-consistent after any INSERT/UPDATE/DELETE, and a single `rxDB.search(query)` / `collection.search(query)` API exposes a reactive result stream.

> The adapter allowlist is the registry in [backend-registry.ts](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-plugin-search/src/backend/backend-registry.ts): `sqlite-wasm` / `sqlite` / `sqliteai` use the SQLite FTS5 backend, `pglite` uses the `pg-tsvector` backend; `wa-sqlite` and `wa-sqlite-miniprogram` are registered as `unverified` (not cleared by real testing). Other adapters have no local SQL connection, and unallowed adapters fail fast with `SearchUnsupportedAdapterError` at plugin registration.

## Core features

- **FTS5 external content tables**: no duplicated text storage; the original table is the single source of truth
- **Sync triggers**: INSERT / UPDATE / DELETE sync automatically; `stringArray` fields expand through `json_each + group_concat`
- **Reactive state machine**: `idle → loading → success / empty / error`, strictly five states
- **300ms debounce by default**: rapid `setQuery` input only runs the last query; requeries triggered by data changes **bypass the debounce**
- **Failure retention**: the `error` state keeps the last query and results; `retry()` retries in one click
- **Schema drift detection**: based on field signature comparison; a mismatch throws `SearchSchemaMismatchError` immediately instead of silently overwriting
- **Bindings for all three frameworks**: Angular `useSearch` / React `useSearch` / Vue `useSearch` with aligned APIs

## Installation

```bash npm2yarn
npm install @aiao/rxdb-plugin-search
# framework bindings (pick the one you need)
npm install @aiao/rxdb-plugin-search-angular
npm install @aiao/rxdb-plugin-search-react
npm install @aiao/rxdb-plugin-search-vue
```

Peer dependencies: `@aiao/rxdb-adapter-pglite`, `@aiao/rxdb-adapter-sqlite-wasm` (both optional); `@aiao/rxdb` / `@aiao/rxdb-adapter-sqlite-core` / `rxjs` are regular dependencies.

## Schema annotation

Only the following field interfaces support `searchable: true`:

- `StringProperty`
- `EnumProperty`
- `StringArrayProperty` (array elements are joined with `\n` before indexing)

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Article',
  tableName: 'article',
  properties: [
    { name: 'id', type: PropertyType.uuid, primary: true },
    { name: 'title', type: PropertyType.string, required: true, searchable: true },
    { name: 'body', type: PropertyType.string, required: true, searchable: true },
    { name: 'tags', type: PropertyType.stringArray, default: () => [], searchable: true },
    { name: 'status', type: PropertyType.enum, enum: ['draft', 'published'], searchable: true },
    { name: 'views', type: PropertyType.integer } // not searchable
  ]
})
class Article extends EntityBase {}
```

An entity needs at least one `searchable` field for an FTS5 table to be created; otherwise that collection does not expose `.search()`.

## Register the plugin

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Article],
  sync: { type: SyncType.None, local: { adapter: 'sqlite-wasm' } }
});
rxdb.use(rxDBPluginSearch, {
  debounce: 300, // default 300ms; 0 disables
  pageSize: 50,
  snippetLength: 120,
  excludedCollections: [] // globally exclude some collections
});
await rxdb.connect('sqlite-wasm');
```

## Angular integration

```typescript
import { Component, inject } from '@angular/core';
import { RxDB } from '@aiao/rxdb';
import { useSearch } from '@aiao/rxdb-plugin-search-angular';

@Component({
  selector: 'app-search',
  template: `
    <input
      [value]="query()"
      (input)="setQuery($any($event.target).value)"
      aria-label="Search"
      role="searchbox"
      type="search"
    />
    <p [attr.aria-live]="'polite'">
      @switch (state()) {
        @case ('loading') {
          Searching…
        }
        @case ('empty') {
          No results
        }
        @case ('error') {
          Error: {{ error()?.message }}
          <button (click)="retry()">Retry</button>
        }
        @case ('success') {
          {{ results().length }} results
        }
      }
    </p>
  `
})
export class SearchComponent {
  private readonly db = inject(RxDB);
  private readonly handle = useSearch(this.db);

  readonly query = this.handle.query;
  readonly results = this.handle.results;
  readonly state = this.handle.state;
  readonly error = this.handle.error;

  setQuery(q: string) {
    this.query.set(q);
  }
  retry() {
    this.handle.retry();
  }
}
```

## React integration

```tsx
'use client';
import { useSearch } from '@aiao/rxdb-plugin-search-react';
import { useRxDB } from '@aiao/rxdb-react';

export function SearchPage() {
  const db = useRxDB();
  const { query, setQuery, results, state, error, retry } = useSearch(db);
  return (
    <div>
      <input
        type="search"
        role="searchbox"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search"
      />
      <p aria-live="polite">
        {state === 'loading' && 'Searching…'}
        {state === 'empty' && 'No results'}
        {state === 'error' && (
          <>
            Error: {error?.message} <button onClick={retry}>Retry</button>
          </>
        )}
        {state === 'success' && `${results.length} results`}
      </p>
    </div>
  );
}
```

## Vue integration

```vue
<script lang="ts" setup>
import { useRxDB } from '@aiao/rxdb-vue';
import { useSearch } from '@aiao/rxdb-plugin-search-vue';

const db = useRxDB();
const { query, results, state, error, retry } = useSearch(db);
</script>

<template>
  <input v-model="query" aria-label="Search" role="searchbox" type="search" />
  <p aria-live="polite">
    <span v-if="state === 'loading'">Searching…</span>
    <span v-else-if="state === 'empty'">No results</span>
    <span v-else-if="state === 'error'">
      Error: {{ error?.message }}
      <button @click="retry">Retry</button>
    </span>
    <span v-else-if="state === 'success'">{{ results.length }} results</span>
  </p>
</template>
```

## API reference

### `rxDBPluginSearch(options?)`

| Option                | Type                | Default | Description                        |
| --------------------- | ------------------- | ------- | ---------------------------------- |
| `debounce`            | `number`            | `300`   | Input debounce (ms); `0` disables  |
| `pageSize`            | `number`            | `50`    | Results per page                   |
| `snippetLength`       | `number`            | `120`   | Max characters of the hit snippet  |
| `excludedCollections` | `readonly string[]` | `[]`    | Globally excluded collection names |

### `rxDB.search(query, options?)` / `collection.search(query, options?)`

Returns a `SearchHandle`:

| Member        | Type                                            | Description                                              |
| ------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `results$`    | `Observable<readonly SearchResult[]>`           | Result stream (BM25 rank ascending)                      |
| `state$`      | `Observable<SearchState>`                       | `idle` / `loading` / `success` / `empty` / `error`       |
| `error$`      | `Observable<SearchExecutionError \| undefined>` | Most recent execution error                              |
| `hasMore$`    | `Observable<boolean>`                           | Whether another page exists                              |
| `setQuery(q)` | `(q: string) => void`                           | Update the query; goes through the debounce channel      |
| `loadMore()`  | `() => Promise<void>`                           | Append the next page; no-op when there is no more        |
| `clear()`     | `() => void`                                    | Clear the query → `idle`                                 |
| `retry()`     | `() => void`                                    | In `error` state, re-enter `loading` with the last query |
| `destroy()`   | `() => void`                                    | Cancel all subscriptions                                 |

### `SearchResult`

| Field          | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `entity`       | Entity name (e.g. `Article`)                                   |
| `collection`   | RxDB collection name                                           |
| `id`           | Primary key                                                    |
| `rank`         | BM25 rank (ascending)                                          |
| `matchedField` | The matched field name                                         |
| `snippet`      | Hit snippet (truncated from the original text, no HTML markup) |

### Error types

- **`SearchSchemaMismatchError`** — the FTS5 signature differs from the current schema; **never auto-drops**; manually clean the `_fts_<table>` and the corresponding migration records before remounting
- **`SearchExecutionError`** — a runtime execution error (SQL failure, etc.); recoverable through `retry()`; `cause` exposes the original exception
- **`SearchUnsupportedAdapterError`** — an adapter outside the allowlist is in use; fails fast at plugin registration

## Accessibility

The binding layer does not force a DOM, but the demos / docs follow one convention:

- Input has `role="searchbox"` + `aria-label`
- The status text container has `aria-live="polite"`
- While searching, write `aria-busy="true"`
- The error state's "Retry" button must be keyboard reachable
- Empty state / result counts are announced by the `aria-live` region

## Schema drift handling

On first mount, the FTS5 table computes a signature from `(table, field-list, normalizer-version)` and writes it into an RxDB migration record (`fts5__<table>__v1__install__<signature>`). Later mounts compare the signature:

- **Signature matches**: reuse directly, `.search()` works immediately
- **Signature differs**: throw `SearchSchemaMismatchError`, **never auto-DROP**

> Design intent: once created, an FTS5 external content table and its triggers are treated as user data; auto-rebuild would lose backfill duration and possibly the index consistency guarantee, so it fails fast.

Manual recovery path:

```sql
-- Migration record name = fts5__<table>__v1__<install|backfill>__<signature>;
-- the signature is a JSON [tokenizer version, [[field, isArray]...]] (array fields are 1)
DROP TABLE IF EXISTS _fts_article;
DELETE FROM rxdb_migration WHERE name IN (
  'fts5__article__v1__install__["unicode61+cjk-unigram-bigram-v3",[["body",0],["status",0],["tags",1],["title",0]]]',
  'fts5__article__v1__backfill__["unicode61+cjk-unigram-bigram-v3",[["body",0],["status",0],["tags",1],["title",0]]]'
);
```

After cleanup, the next database connection runs install + backfill again against the current schema.

## Writable checkouts

A writable checkout of [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md) owns one set of business tables (shadow tables) in the same database, and each table set has its own full-text index:

- `checkouts.add()` builds and backfills the checkout's table indexes in the same transaction that creates the tables (this plugin's declared `worktreeTableSet.created` hook). SQLite: the shadow table's own `_fts_<physical table name>` virtual table and triggers; PostgreSQL: the `_fts` column, GIN index, and triggers on that table in the shadow schema.
- Queries follow whichever table set the instance is currently mounted on: mounted on a checkout, you only search its tables; back on the main checkout, you only search the main tables. Existing `SearchHandle`s requery automatically after a remount.
- If this plugin was not installed when the checkout was created, the first search after mounting builds the indexes in one transaction.
- Migration records (the previous section) only track the main table set. The checkout's copy is checked by catalog; missing pieces are added, and deleting a checkout deletes its indexes with the tables.
- This plugin contributes a segment to the checkout fingerprint (the backend plus each member's install-plan signature: searchable fields and tokenizer version): when fields, the tokenizer version, or the exclusion list change, mounting the checkout rebuilds the whole set and its indexes.

## Field-level exclusion

Only fields that satisfy both conditions enter the FTS5 index:

1. Type is `StringProperty` / `EnumProperty` / `StringArrayProperty`
2. Explicitly marked `searchable: true`

Other fields (such as `IntegerProperty` or an unmarked `string`) **do not participate in the index, do not participate in the BM25 rank**, and never appear in `SearchResult.matchedField`.

```typescript
{ name: 'title', type: PropertyType.string, searchable: true },   // indexed
{ name: 'body',  type: PropertyType.string, searchable: true },   // indexed
{ name: 'views', type: PropertyType.integer },                    // not indexed
{ name: 'note',  type: PropertyType.string }                      // not indexed (unmarked)
```

## Collection scope control

`rxDB.search(query, options)` computes the intersection in this order when aggregating:

1. **Candidates**: all collections with at least one `searchable` field
2. **Plugin-level exclusion**: minus `excludedCollections` (a hard exclusion, regardless of what the caller asks)
3. **Per-call allowlist**: intersect with `SearchOptions.collections` (skipped when absent)

```typescript
// Globally exclude comments; this call only searches Article
db.search('rxdb', { collections: ['Article'] });
```

A collection without any mounted `searchable` field does not expose `collection.search()`; calling `(collection as any).search` yields `undefined`, usable as a capability probe.

> The resolution logic is implemented as a pure function in [resolveSearchScope](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-plugin-search/src/core/scope-resolver.ts) and can be unit-tested independently.

## Reactive updates and retry

`SearchHandle` exposes the five states plus two requery channels:

- **User input path**: `setQuery(q)` → default 300 ms debounce → enter `loading`
- **Data change path**: underlying entity create/update/remove events **bypass the debounce** and go straight to the pipeline, so results are visible immediately after a write
- **Failure retention**: the `error` state keeps the last query and the previous result set (the UI is not cleared)
- **Retry re-entry**: in the `error` state, `retry()` re-enters `loading` with `lastQuery`; other states are a no-op

A successful recovery **does not introduce a sixth state**: the state goes `error → loading → success/empty`, and the UI announces the change through the `aria-live` region.

```ts
// React example: the user clicks "Retry" after a failure
{state === 'error' && (
  <button onClick={retry} aria-label="Retry last search">
    Retry
  </button>
)}
```

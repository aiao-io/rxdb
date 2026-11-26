# @aiao/rxdb-plugin-querycache

> Implements: [US-025 core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

The read engine for `SyncType.QueryCache`: fetch from the remote by `where`, compare `updatedAt` metadata, write results into a local disposable cache, and deduplicate concurrent identical queries.

The `SyncType.QueryCache` value and the primitive contracts adapters implement (`QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` and so on) stay in `@aiao/rxdb`; this package provides the read path that consumes those primitives. Applications that do not use this strategy do not install this package, and core does not contain this code.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
```

The QueryCache **write** path depends on the outbound queue provided by `@aiao/rxdb-plugin-sync`, and the sync plugin declares `inject: ['plugin:history']`. Missing any of the three plugin packages makes `connect()` throw `RxDBMissingPluginError`.

## Usage

```typescript
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

@Entity({
  name: 'CachedProduct',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class CachedProduct extends EntityBase {
  title!: string;
}

const rxdb = new RxDB({
  dbName: 'shop',
  entities: [CachedProduct],
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
});
rxdb.adapter('sqlite' /* … */).adapter('supabase' /* … */);

// Pass the factory functions themselves, do not call them. Registration order is free — the host honors `inject` so history installs before sync
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);
rxdb.use(rxDBPluginQueryCache);

await rxdb.connect('sqlite');
rxdb.init();
```

When any `use()` is missing, `connect()` throws `RxDBMissingPluginError` with a message naming which entity declared `SyncType.QueryCache` and which package to install. `connect()` checks two slots — the read engine (this package) and the outbound queue (the sync plugin), so installing only this package also fails. It does **not** degrade to a local read — after a silent degradation, callers would see "the remote has no such row" instead of a failure, which is much harder to debug.

## Cache semantics

- **Reads**: first ask the remote for `(id, updatedAt)` metadata matching the `where`, compare against the local cache, and only re-fetch rows that actually changed; everything else uses the local copy.
- **Deduplication**: identical queries within `syncStaleTime` (default 1000ms) share one remote fetch; set `0` to disable this memory.
- **`localCacheFirst`**: when enabled, emit the local copy first and follow up with the refreshed result, trading a first-screen wait for one content update.
- **Offline**: when the remote is unreachable, reads fall back to the local cache; writes land locally and enter the outbound queue, replayed by `@aiao/rxdb-plugin-sync`'s write-back path after recovery.
- **Entity identity**: remote resources and the local cache table are located by `@aiao/rxdb-plugin-sync`'s `queryCacheEntityIdentifier` (`public` uses the bare entity name, other namespaces are written `namespace:entity`); online reads/writes and offline replay use the same identifier.
- **Write acknowledgment order**: acknowledgments for several writes to the same row may arrive out of order. Cache writes are judged by send order — when a later-sent write (including offline writes) has already landed in the cache, a late acknowledgment is still returned to the caller but no longer written locally. The local cache reflects the last write that was sent; drift caused by the server executing in a different order than sent converges on the next read sync via remote metadata.
- **The cache is a disposable projection**: cache writes and orphan cleanup do not enter the change log, and do not interact with the versioned write path of `SyncType.Full`. Mixing both entity kinds in one `saveMany()` batch is rejected (`RxDBMixedVersionedCacheTransactionError`); split the batches.

## Remote contract and invalidation reporting

### The remote row column contract (US-022)

QueryCache pulls land through **raw SQL writes that bypass the repository** (`upsertMany`); the entity's `default` does not participate. Therefore every row the remote returns must carry **all non-null columns of the local table** — including the framework columns `createdAt` / `updatedAt` declared by `EntityBase`. `id`, `updatedAt`, and business fields alone are not enough:

- Missing non-null columns → `RxDBQueryCacheRowContractError` before landing, with a message naming the entity and the missing columns; **not a single row of the batch lands**, leaving no half-batch dirty data (validation runs outside the transaction).
- Extra columns the local table does not have do not error (they are filtered by existing logic); a heterogeneous row set within a batch (first row has `tag`, second does not) is also judged as missing columns.
- The contract holds for **all** QueryCache remotes (HTTP, Supabase views, and self-built services all share the same landing path) — it is not HTTP-specific; local defaults are not backfilled — a `createdAt` patched in place would be this machine's pull time, and two machines pulling the same row would get different values.

### The PGlite half's contract differences (US-024)

The two local row-cache backends (`rxdb-adapter-sqlite-core` and `rxdb-adapter-pglite`) **judge by their own table DDL rules**, each with its own error class but the same `name` of `'RxDBQueryCacheRowContractError'` and the same message skeleton (cross-backend recognition uses `name`). Two deliberate divergences:

| Case                                              | SQLite family                                           | PGlite                                                                |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `uuid` primary key                                | Exempt (DDL has `DEFAULT (lower(hex(randomblob(16))))`) | **Required** (`"id" uuid PRIMARY KEY` has no default)                 |
| Relation column `SET NULL` with `nullable: false` | Exempt (no NOT NULL emitted)                            | **Required** (NOT NULL emitted)                                       |
| `integer` primary key                             | Exempt (AUTOINCREMENT)                                  | Exempt (`serial` implies `nextval()`, for a different reason)         |
| `default: null` on a non-null column              | Existing mis-exemption, kept as is                      | Not a usable default, still required                                  |
| Non-null `binary` column with a literal `default` | Still required                                          | Still required (both sides' DDL skip the DEFAULT clause for `binary`) |

"Required" judges the **value**, not just the key: `{ createdAt: null }` is also rejected ("key present but value null" and "column missing" are two wordings with different fixes). All three foreign key spellings for relation columns (relation name / foreign key alias / physical column name) are recognized on both sides — a row carrying `teamId` is not misjudged as missing `team`.

### Invalidation reporting and realtime sync (US-023)

For live queries to follow remote changes by themselves, use core's invalidation reporting entry:

```typescript
rxdb.invalidateRemoteEntity('recipe'); // entity name; namespace defaults to 'public'
```

- **Granularity is the whole entity**, propagated to dependent relation queries through the existing `depEntityTypeMap` / `relationEntityTypes`; the signature has **no place for row data** — the notification only says "it changed", not "what it became"; the authoritative value is decided by `fetchMetadata` on the rerun.
- Action order is fixed: **synchronously** clear the sync memory and in-flight queries → after a coalescing window (one microtask) rerun the affected live queries together, at most once per task; memory is generation-aware, so an in-flight sync is not wiped by an invalidation.
- An unregistered entity name neither errors nor does anything; reporting on a non-QueryCache entity is a no-op; the event is not broadcast across tabs.
- The new event is `REMOTE_ENTITY_INVALIDATED_EVENT`; it does not reuse the changelog-semantics `ENTITY_REMOTE_*` events.

**The realtime channel (the HTTP adapter's `changeFeed`, SSE) is off by default**: configuring `changeFeed` opens one change notification connection, the server only broadcasts entity names, and the adapter calls the invalidation reporting entry; self-echo is suppressed by `clientId`, disconnects reconnect with exponential backoff, and **every connection (including reconnects) invalidates everything once** (nobody resends changes from the disconnect window). There is no polling fallback and no `Last-Event-ID` catch-up — an unreachable SSE only reports a diagnostic signal and the query path keeps working. For integration details and parameters, see the [HTTP adapter](../../adapters/http.md).

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; its only host mutation — filling the engine factory into the `rxdb.queryCacheEngine()` slot — is registered on the scope received by `install(scope)` and revoked with the scope on `disconnectAll()`; the host never calls `destroy()`. A new `connect()` installs a brand-new factory instead of reviving the previous epoch's.

## Migration

To upgrade from the version where the read engine was built into core, see [QueryCache read engine extraction](../../migration/querycache-plugin.md).

# rxdb-plugin-querycache

> Implements: [US-025 core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

Read engine for `SyncType.QueryCache`: fetches the remote by `where`, compares `updatedAt` metadata, writes results into a local discardable cache, and deduplicates concurrent identical queries.

The `SyncType.QueryCache` value itself, plus the adapter primitive contracts it requires (`QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` etc.), still live in `@aiao/rxdb`; this package provides the read path that consumes those primitives. Apps that don't use this strategy don't install this package, and core doesn't contain this code.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
```

The QueryCache **write** path relies on the outbound queue provided by `@aiao/rxdb-plugin-sync`, and the sync plugin declares `inject: ['plugin:history']`. If any of the three plugin packages is missing, `connect()` throws `RxDBMissingPluginError`.

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
    remote: `{ adapter: 'supabase' }`
  }
})
class CachedProduct extends EntityBase {
  title!: string;
}

const rxdb = new RxDB({ dbName: 'shop', entities: [CachedProduct] });
rxdb.adapter('sqlite' /* … */).adapter('supabase' /* … */);

// Pass the factory function itself, do not call it. Registration order is arbitrary;
// the host guarantees history comes before sync via `inject`
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);
rxdb.use(rxDBPluginQueryCache);

await rxdb.connect('sqlite');
rxdb.init();
```

When any `use()` is missing, `connect()` throws `RxDBMissingPluginError` with a message naming which entity declared `SyncType.QueryCache` and which package to install. `connect()` checks both slots — the read engine (this package) and the outbound queue (the sync plugin) — so installing only this package also fails. It does **not** fall back to a local read — after such a fallback the caller would see "the remote doesn't have this row", which is far harder to diagnose than failing outright.

## Cache semantics

- **Read**: first asks the remote for `(id, updatedAt)` metadata matching the `where`, compares it against the local cache, and only re-fetches rows that actually became newer; the rest use the local copy.
- **Deduplication**: identical queries within `syncStaleTime` (default 1000ms) share the same remote round-trip; set `0` to disable this memory.
- **`localCacheFirst`**: when enabled, emits the local copy first and the remote result follows — turns the first-screen wait into a content update.
- **Offline**: reads fall back to the local cache when the remote is unreachable; writes go local and into the outbound queue, replayed by the write-back path of `@aiao/rxdb-plugin-sync` after recovery.
- **Entity identity**: remote resources and the local cache table are located via `queryCacheEntityIdentifier` from `@aiao/rxdb-plugin-sync` (`public` uses the bare entity name, other namespaces are written as `namespace:entity`); online reads/writes and offline replay use the same one.
- **Write-ack ordering**: acknowledgements of several successive writes to the same row may arrive out of order. Cache writes follow send order — when a later-sent write (including offline writes) has already landed in the cache, the late ack is still returned to the caller but no longer written locally. The local cache keeps the last-sent write; divergence caused by the server executing in a different order than send order converges via remote metadata at the next read sync.
- **The cache is a discardable projection**: cache writes and orphan cleanup never enter the changelog and never intersect the versioned write path of `SyncType.Full`. Mixing the two entity kinds in one `saveMany()` batch is rejected (`RxDBMixedVersionedCacheTransactionError`); batch them separately.

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; its only host change — filling the engine factory into the `rxdb.queryCacheEngine()` slot — is registered on the scope received by `install(scope)` and revoked together with the scope on `disconnectAll()`; the host never calls `destroy()`. A new `connect()` installs a brand-new factory instead of resurrecting the previous epoch's one.

## Migration

To upgrade from versions where the read engine was bundled into core, see [QueryCache read engine extraction](https://rxdb.aiao.io/docs/migration/querycache-plugin).

`@aiao/rxdb-plugin-querycache` — the read engine for `SyncType.QueryCache`.

## Remarks

Core keeps only the `SyncType.QueryCache` enum member and the five adapter primitive contracts (`QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` etc., still exported from `@aiao/rxdb`); the read path of "fetch remote by where, compare metadata, write back to local cache" lives in this package.

## Example

```ts
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

rxdb.use(rxDBPluginQueryCache);
```

## Classes

| Class                                                   | Description                                 |
| ------------------------------------------------------- | ------------------------------------------- |
| [QueryCacheEngine](classes/QueryCacheEngine.md)         | Repository for the QueryCache sync strategy |
| [RxDBPluginQueryCache](classes/RxDBPluginQueryCache.md) | QueryCache read engine plugin.              |

## Type Aliases

| Type Alias                                                                 | Description                              |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| [RxDBPluginQueryCacheOptions](type-aliases/RxDBPluginQueryCacheOptions.md) | This plugin currently accepts no options |

## Variables

| Variable                                                  | Description                            |
| --------------------------------------------------------- | -------------------------------------- |
| [rxDBPluginQueryCache](variables/rxDBPluginQueryCache.md) | QueryCache read engine plugin factory. |

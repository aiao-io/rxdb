# Query-cache read engine split

The read engine of `SyncType.QueryCache` moved from `@aiao/rxdb` into `@aiao/rxdb-plugin-querycache`, and the offline-write **outbound queue** moved at the same time into `@aiao/rxdb-plugin-sync`. **This is a breaking change**: applications using this sync strategy must install and register all three plugin packages, or `connect()` throws.

Applications without `SyncType.QueryCache` entities are unaffected and can upgrade as-is — core sheds roughly 1,500 lines of read path that only a few applications used.

## Application developers

### 1. Install and register the plugins

One complete QueryCache read/write path spans three packages; all are required:

| Capability                   | Provider                       | Notes                                                                                          |
| ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| QueryCache read engine       | `@aiao/rxdb-plugin-querycache` | Fetches from the remote, compares `updatedAt`, writes the local cache                          |
| Offline write outbound queue | `@aiao/rxdb-plugin-sync`       | The read engine uses it to tell "the remote returned nothing" from "a local offline write"     |
| Sync-history bridge          | `@aiao/rxdb-plugin-history`    | The sync plugin declares `inject: ['plugin:history']`, a hard prerequisite for becoming active |

```bash
pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
```

```diff
 import { RxDB, SyncType } from '@aiao/rxdb';
+import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
+import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
+import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

 const db = new RxDB({ dbName: 'shop', entities: [CachedProduct] });
 db.adapter('sqlite', /* … */).adapter('supabase', /* … */);
+// Registration order is irrelevant: the host sorts by `inject` topology, history is always installed before sync
+db.use(rxDBPluginHistory);
+db.use(rxDBPluginSync);
+db.use(rxDBPluginQueryCache);

 await db.connect('sqlite');
```

`use()` takes the **plugin factory function itself**; do not call it (`db.use(rxDBPluginQueryCache)`, not `db.use(rxDBPluginQueryCache())`).

Applications already doing push/pull sync have mostly installed history + sync; this step only adds the querycache package. The full sync migration when upgrading from old core is in [History and sync package split](/migration/history-sync-plugins.md).

Entity metadata needs zero changes: `@Entity({ sync: { type: SyncType.QueryCache, … } })` stays as-is — `SyncType` is a closed union, and the enum values remain in core.

### 2. Symptoms of a missing package

At the end of `connect()`, two slots are checked: the read engine and the outbound queue. Whichever is missing, the error names its package and throws `RxDBMissingPluginError`:

```text
Entity 'CachedProduct' declares SyncType.QueryCache but no engine is installed.
Install '@aiao/rxdb-plugin-querycache' and register it via rxdb.use(rxDBPluginQueryCache).
```

With only querycache installed and sync missing, the first guard passes and the second one stops you — so install all three packages together. With history missing, the sync plugin is not installed at all (dependency unsatisfied, one console warning), and the outbound slot is empty for the same reason.

The error is thrown at startup, not on the first `find()`, and it does **not degrade to a local read** — after such degradation the caller sees "the remote has no row with this data", which is far harder to diagnose than failing directly. The outbound queue in particular must not be treated as an empty set: the read engine uses pending writes to distinguish "the remote returned nothing" from "a local offline write happened"; an empty set would make every offline write look orphaned and get deleted, and silent degradation here means losing user data.

### 3. Code that instantiates `QueryCacheRepository` directly

`QueryCacheRepository` was removed from the public surface of `@aiao/rxdb` and renamed to the plugin package's `QueryCacheEngine`:

```diff
-import { QueryCacheRepository } from '@aiao/rxdb';
+import { QueryCacheEngine } from '@aiao/rxdb-plugin-querycache';

-const repo = new QueryCacheRepository('Product', remoteAdapter, localAdapter);
+const repo = new QueryCacheEngine('Product', remoteAdapter, localAdapter);
```

This entry is marked experimental in the [versioning and API stability policy](/versioning.md), so the rename is not bound by the deprecation cycle. Normal usage (getting repositories through `entityManager.getRepository()`) never touches this class.

## What stays in core

What moved out is the **consumer**, not the contract. The following symbols are still exported from `@aiao/rxdb`; adapter authors and the outbound write-back path keep using them with unchanged import paths:

| Symbol                                                     | Purpose                                |
| ---------------------------------------------------------- | -------------------------------------- |
| `SyncType.QueryCache`                                      | Entity metadata value                  |
| `QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter`       | Primitive contracts adapters implement |
| `QueryCacheLocalReader` / `QueryCacheEntity` / `SyncStats` | Companion types of the same contracts  |
| `QueryCachePendingWriteIds`                                | Outbound queue occupancy query         |
| `RxDBQueryCacheCapabilityError`                            | Error when an adapter lacks capability |

Note that `QueryCachePendingWriteIds` is a **contract** — what stays in core is only the interface; the implementation that fills it (the outbound path replaying local changes from the offline period back to the remote) lives in `@aiao/rxdb-plugin-sync`, and the `rxdb.queryCacheOutbox()` slot in core is registered by that plugin inside the connection epoch.

## Plugin / adapter authors

Core gained a **strategy-axis runtime slot** to receive the read engine:

```typescript
import type { QueryCacheEngineFactory, QueryCacheSession, QueryCacheSessionContext } from '@aiao/rxdb';

rxdb.queryCacheEngine(factory, scope); // registered with epoch scope, revoked on disconnect
rxdb.getQueryCacheEngine(); // reads the slot; undefined when no plugin is installed
```

It is **not** a registry: `SyncType` is a closed union, and this slot's member is always QueryCache alone. Adding a new sync strategy still requires changing core — unlike the facade-axis `RxDBRepositories` registry, which plugins can extend.

## See also

- [Authoring plugins](/plugins/authoring.md): the `install(scope)` contract and scope usage
- [History and sync package split](/migration/history-sync-plugins.md): the full `versionManager` → `syncManager` mapping
- [Plugin lifecycle migration](/migration/plugin-scope.md): this package's registration is likewise revoked with the connection epoch
- [Versioning and API stability](/versioning.md): the experimental tier and the breaking-change process

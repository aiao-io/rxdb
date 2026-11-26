# @aiao/rxdb-plugin-sync

> Implements: [US-025 core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

Push-pull sync, conflict landing, and repository dependency ordering. Install it and `rxdb.syncManager` exists.

Core `@aiao/rxdb` keeps the **primitives**: the `RxDBSync` watermark table, change encoding, the conflict model (`ConflictResolution` / `RxDBConflictError`), and sync eligibility checks. What moved into this package are the **consumers**: push / pull / sync at both whole-database and single-repository granularity, conflict landing, dependency topological ordering, expiry cleanup, and the QueryCache outbound queue.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync
```

`@aiao/rxdb-plugin-history` is not optional: this package declares `inject: ['plugin:history']`.

## Usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

const rxdb = new RxDB({
  dbName: 'notes',
  entities: [Note],
  sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
});

// Pass the factory functions themselves, do not call them; the order of the two use() calls is free — the host topologically sorts by inject
rxdb.use(rxDBPluginHistory).use(rxDBPluginSync).adapter('wa-sqlite' /* … */);

await rxdb.connect('wa-sqlite');

await rxdb.syncManager.sync();
await rxdb.syncManager.pushRepository('public', 'note');
```

`use()` must run before `connect()` — `connect()` calls `init()` internally.

This package's `install()` is guaranteed to finish before `connect()` returns — worth noting even more than for plugins without `inject`: a plugin that declares dependencies is **not** installed during `init()`; it waits for the history plugin to finish installing and reach the `active` state, then the host runs another alignment pass. Reading `rxdb.syncManager` right after `rxdb.init()` can yield `undefined` — that is timing, not a defect — `connect()` is the resting point of this chain.

## Main capabilities

| Group             | Entry points                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Push-pull         | `push()` / `pull()` / `sync()` / `pushRepository()` / `pullRepository()` / `syncRepository()` |
| Bulk              | `bulkSync()` / `getRepositoryDependencyGraph()` / `getRepositorySyncOrder()`                  |
| Repository status | `getRepositorySyncStatus()` / `getAllRepositorySyncStatus()` / `checkRepositoryUpdates()`     |
| Branches          | `syncBranches()`                                                                              |
| Counts            | `refreshPullableCount()`                                                                      |
| Cleanup           | `cleanupExpired()`                                                                            |

The watermark is `RxDBSync.lastPushedChangeId`, shared by push and the QueryCache outbound queue — both send local changes to the remote, and two separate watermarks would give one table two answers to "how far have we pushed".

## Relationship with the history plugin

One-directional: this package declares `inject: ['plugin:history']`, and the history package does not know about this one. Coupling goes through one narrow interface (`SyncHistoryBridge`) — after a round trip, the undo boundary must be invalidated and the pullable count settled, and the owners of that state live on the history side.

The two have different lifecycles, which is why they are separate packages: undo/redo must be in place before the first `rxdb_change` (which is why the history plugin declares **no** `inject`), while push-pull sync only matters when a remote is configured.

## Relationship with the QueryCache plugin

Only `import type { QueryCacheRemoteAdapter }` — **no** `inject` runtime dependency. A workspace that installs this package without `@aiao/rxdb-plugin-querycache` and has no QueryCache entities runs fine.

The QueryCache entity identifier `queryCacheEntityIdentifier(namespace, entity)` is exported by this package: `public` uses the bare entity name, other namespaces are written `namespace:entity`. The read engine package's online reads/writes and this package's outbound replay share it — remote resource mappings (such as the HTTP adapter's `resources`) and the local cache table are both located by this identifier, and each side assembles its own; otherwise, offline writes for non-public entities would be replayed onto same-named public entities. The read engine package already depends on this package, so the identifier can only come from this side.

## Without the plugin

`rxdb.syncManager` **does not exist** (it reads `undefined`); core does not provide a do-nothing shell.

When only this package is installed and the history plugin is forgotten, this package stays in `waiting` and never installs — once the dependency source settles, the host names it once:

```
[RxDB] Plugin 'sync' is not installed: unsatisfied dependencies [plugin:history]
```

The pullable count on the `syncState` panel is maintained by this package: remote adapters call `syncState.requestPullableRefresh()` after a realtime subscription recovers, and this package picks it up and calls `refreshPullableCount()`. Without this package, that reading is simply unmaintained — which is the truth, not zero.

## Rejected pushes

The remote merges per entity and lands the whole batch or rejects it as a whole. Rejected entities do not fail the entire push round: the local commit completes as usual, all source changes of that entity get `rejectedAt` and `rejection` written, `remoteId` stays empty, and they are never pushed again; when the round has rejections, this package calls `syncState.reportRejections()` once.

`SyncState.lastRejections` is the list of `SyncRejection` entries from the most recent push round that had rejections. Each entry carries the entity (`namespace` / `entity` / `entityId`), the merged remote operation `op`, the SQLSTATE `code`, the classification `reason`, the remote's original `message`, the commit time `at`, and the source `changeIds`:

| `reason`     | Meaning                         | Typical `code` |
| ------------ | ------------------------------- | -------------- |
| `denied`     | Rejected by RLS                 | `42501`        |
| `gone`       | The remote row no longer exists | `RX001`        |
| `dependency` | A parent entity's push failed   | `23503`        |

Two semantics:

- **Not cleared by later success** — if the following rounds all succeed, the list stays as is;
- **Wholly replaced by the next round with rejections** — never merged with the previous round.

All three frameworks read it through `useSyncState().lastRejections` (Angular `Signal`, Vue `ComputedRef`, React snapshot field).

`lastRejections` lives only in memory and is empty after a restart. To inspect rejected changes across restarts, query `RxDBChange` rows with a non-null `rejectedAt`:

```ts
import { RxDBChange } from '@aiao/rxdb';

rxdb.entityManager
  .getRepository(RxDBChange)
  .find({
    where: {
      combinator: 'and',
      rules: [{ field: 'rejectedAt', operator: '!=', value: null }]
    }
  })
  .subscribe(changes => {
    for (const change of changes) console.log(change.entity, change.rejection);
  });
```

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; all three host mutations are registered on the scope received by `install(scope)` and released in reverse order on `disconnectAll()` — the host never calls `destroy()`: the `SyncManager` instance itself (its `destroy()` also tears down the `connected$` auto-push subscription and the remote event listeners), the `rxdb.syncManager` slot, and the `syncState.bindPullableRefresh()` trampoline. Release follows reverse topological order, so this package is revoked before the history plugin.

A new `connect()` installs a brand-new manager instead of reviving the previous epoch's — the event bus the latter points to has been torn down.

## Migration

To upgrade from the version where `syncManager` hung directly on core, see [History and sync extraction](../../migration/history-sync-plugins.md).

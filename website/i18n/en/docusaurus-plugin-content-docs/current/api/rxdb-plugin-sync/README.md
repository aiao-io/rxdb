# rxdb-plugin-sync

> Implements: [US-025 core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

Push/pull sync, conflict landing, and repository dependency ordering. Install it
and `rxdb.syncManager` exists.

What the core `@aiao/rxdb` keeps are the **primitives**: the `RxDBSync`
waterline table, change codec, conflict model (`ConflictResolution` /
`RxDBConflictError`), and sync eligibility judgment. What moved into this
package are the **consumers**: push / pull / sync at the whole-database and
single-repository granularities, conflict landing, dependency topological
ordering, expiry cleanup, and the QueryCache outbound queue.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync
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
  sync: `{ type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }`
});

// Pass the factory function itself, don't call it; the order of the two use() calls doesn't matter — the host topologically sorts by inject
rxdb.use(rxDBPluginHistory).use(rxDBPluginSync).adapter('wa-sqlite' /* … */);

await rxdb.connect('wa-sqlite');

await rxdb.syncManager.sync();
await rxdb.syncManager.pushRepository('public', 'note');
```

`use()` must come before `connect()` — `connect()` calls `init()` internally.

This package's `install()` is guaranteed to have finished before `connect()`
returns, which matters more here than for plugins without `inject`: a plugin
declaring dependencies is **not** installed in `init()` — it waits for the
history plugin to be installed, the state to turn `active`, and the host to run
another alignment pass before it gets its turn. Reading `rxdb.syncManager`
immediately after `rxdb.init()` gives `undefined`; that is not a defect but
timing — `connect()` is the still point of this chain.

## Main capabilities

| Group             | Entry                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Push/pull         | `push()` / `pull()` / `sync()` / `pushRepository()` / `pullRepository()` / `syncRepository()` |
| Batch             | `bulkSync()` / `getRepositoryDependencyGraph()` / `getRepositorySyncOrder()`                  |
| Repository status | `getRepositorySyncStatus()` / `getAllRepositorySyncStatus()` / `checkRepositoryUpdates()`     |
| Branches          | `syncBranches()`                                                                              |
| Counts            | `refreshPullableCount()`                                                                      |
| Cleanup           | `cleanupExpired()`                                                                            |

The waterline is `RxDBSync.lastPushedChangeId`, shared by push and the QueryCache
outbound — both are sending local changes to the remote, and keeping one
waterline per side would leave "how far has been pushed" with two answers on the same table.

## Relationship to the history plugin

One-directional: this package has `inject: ['plugin:history']` and the history
package knows nothing about this package. The coupling only goes through one
narrow interface (`SyncHistoryBridge`) — at the end of a round trip the undo
boundary must be invalidated and the pullable count settled, and the owners of
that state are on the history side.

The two things have different lifecycles, which is why they are separate
packages: undo/redo must be in place before the first `rxdb_change`, while
push/pull sync only makes sense with a remote configured.

## Relationship to the QueryCache plugin

Only `import type { QueryCacheRemoteAdapter }`, producing **no** `inject`
runtime dependency. A workspace with this package installed, without
`@aiao/rxdb-plugin-querycache`, and without QueryCache entities runs normally.

The QueryCache entity identifier `queryCacheEntityIdentifier(namespace, entity)`
is exported by this package: `public` uses the bare entity name, and other
namespaces are written as `namespace:entity`. The read engine package's online
read/write and this package's outbound replay share it — remote resource maps
(like the HTTP adapter's `resources`) and local cache tables are both located
by this identifier, and if each side composed its own, offline writes of
non-public entities would be replayed onto public entities of the same name.
The read engine package already depends on this package, so the identifier can
only come from this side.

## Without the plugin installed

`rxdb.syncManager` **does not exist** (reads `undefined`); the core gives no do-nothing shell.

With only this package installed and the history plugin forgotten, this package
stays `waiting` and never installs — once the dependency sources are settled the
host names it once:

```
[RxDB] Plugin 'sync' is not installed: unsatisfied dependencies [plugin:history]
```

The pullable count on the `syncState` panel is maintained by this package: the
remote adapter sends `syncState.requestPullableRefresh()` after a live
subscription resumes, and this package catches it and calls
`refreshPullableCount()`. Without this package installed, that reading is
maintained by nobody — which is the truth, not zero.

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; all six host mutations are registered
on the scope received by `install(scope)`, released in reverse order by
`disconnectAll()`, and the host never calls `destroy()`: the `SyncManager`
instance itself (whose `destroy()` takes the `connected$` auto-push
subscriptions and remote event listeners down with it), the
`rxdb.syncManager` slot, and the `syncState.bindPullableRefresh()` relay.
Release follows reverse topological order, so this package is undone before the
history plugin.

A new `connect()` installs a brand-new manager rather than resurrecting the
previous epoch's one — the event bus the latter points at has already been dismantled.

`@aiao/rxdb-plugin-sync` — push/pull sync, conflict handling, and repository dependency ordering.

## Remarks

The core `@aiao/rxdb` only keeps the **primitives**: the `RxDBSync` waterline
table, change codec, conflict model (`ConflictResolution` / `RxDBConflictError`),
and sync eligibility judgment. What moved into this package are the
**consumers**: push / pull / sync at the whole-database and single-repository
granularities, conflict landing, dependency topological ordering, expiry
cleanup, and the outbound queue.

Before US-025 phase D these entries hung on the `VersionManager` of
`@aiao/rxdb-plugin-history`. The two things have different lifecycles: undo/redo
must be in place before the first `rxdb_change`, while push/pull sync only makes
sense with a remote configured — which is why they are separate packages.

This package has `inject: ['plugin:history']` and no reverse dependency — the
history package knows nothing about this package. This one-directional coupling
only goes through one narrow interface: at the end of a round trip the undo
boundary must be invalidated and the pullable count settled, and the owners of
that state are on the history side.

## Example

```ts
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);
await rxdb.connect();

await rxdb.syncManager.sync();
```

## Classes

| Class                                                               | Description                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [RemoteBackendMismatchError](classes/RemoteBackendMismatchError.md) | The remote identity does not match the remote the local sync records belong to |
| [RxDBPluginSync](classes/RxDBPluginSync.md)                         | The push/pull sync / conflict / repository dependency ordering plugin.         |

## Interfaces

| Interface                                                                          | Description                                                                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [BulkSyncOptions](interfaces/BulkSyncOptions.md)                                   | Bulk sync options                                                                                                            |
| [BulkSyncResult](interfaces/BulkSyncResult.md)                                     | Bulk sync result                                                                                                             |
| [CheckRepositoryUpdatesResult](interfaces/CheckRepositoryUpdatesResult.md)         | Repository update check result.                                                                                              |
| [CleanupExpiredOptions](interfaces/CleanupExpiredOptions.md)                       | Expired data cleanup options                                                                                                 |
| [CleanupExpiredResult](interfaces/CleanupExpiredResult.md)                         | Expired data cleanup result                                                                                                  |
| [GetAllRepositorySyncStatusFilter](interfaces/GetAllRepositorySyncStatusFilter.md) | The filter options of getAllRepositorySyncStatus                                                                             |
| [QueryCacheOutboxFailure](interfaces/QueryCacheOutboxFailure.md)                   | One replay failure.                                                                                                          |
| [QueryCacheOutboxResult](interfaces/QueryCacheOutboxResult.md)                     | The result of one round of outbound replay, the return value of [flushQueryCacheOutbox](functions/flushQueryCacheOutbox.md). |
| [RebindRemoteBackendResult](interfaces/RebindRemoteBackendResult.md)               | The result of `SyncManager.rebindRemoteBackend()`                                                                            |
| [RepositorySyncStatus](interfaces/RepositorySyncStatus.md)                         | Repository sync status                                                                                                       |
| [SyncBranchesResult](interfaces/SyncBranchesResult.md)                             | The result of one round of [SyncManager.syncBranches](interfaces/SyncManager.md#syncbranches).                               |
| [SyncManager](interfaces/SyncManager.md)                                           | The sync manager                                                                                                             |

## Type Aliases

| Type Alias                                                     | Description                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| [DependencyGraph](type-aliases/DependencyGraph.md)             | The dependency graph. Key: `{namespace}:{entity}`.          |
| [RxDBPluginSyncOptions](type-aliases/RxDBPluginSyncOptions.md) | This plugin currently accepts no options                    |
| [SyncBranchSkipReason](type-aliases/SyncBranchSkipReason.md)   | The specific reason a remote branch was skipped this round. |

## Variables

| Variable                                      | Description              |
| --------------------------------------------- | ------------------------ |
| [rxDBPluginSync](variables/rxDBPluginSync.md) | The sync plugin factory. |

## Functions

| Function                                                              | Description                                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [countQueryCacheOutbox](functions/countQueryCacheOutbox.md)           | Counts the change rows of all QueryCache repositories on the current branch not yet pushed back to the remote.                                                   |
| [flushQueryCacheOutbox](functions/flushQueryCacheOutbox.md)           | Replays the offline changes backlogged in a QueryCache repository back to the remote.                                                                            |
| [pendingQueryCacheWriteIds](functions/pendingQueryCacheWriteIds.md)   | Gets the entity ids of a QueryCache repository currently **held by the outbound queue**.                                                                         |
| [queryCacheEntityIdentifier](functions/queryCacheEntityIdentifier.md) | The entity identifier in the QueryCache adapter contract: the `public` namespace is written as the bare entity name, and other namespaces as `namespace:entity`. |

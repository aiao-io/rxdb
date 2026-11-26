# History and sync package split

History / undo-redo / branches moved from `@aiao/rxdb` into `@aiao/rxdb-plugin-history`, and push/pull sync moved into `@aiao/rxdb-plugin-sync`. **This is a breaking change**: core no longer auto-creates `versionManager`, and the sync methods moved to a new mount point.

Applications that only use local storage and never touch history or sync are unaffected and can upgrade as-is.

## First decide which packages you need

| Capability in use                                              | Packages needed                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Local reads and writes only                                    | No plugin                                                        |
| Undo/redo / history queries / branches (`rxdb.versionManager`) | `@aiao/rxdb-plugin-history`                                      |
| Push/pull sync (`syncRepository` / `push` / `pull`, etc.)      | `+ @aiao/rxdb-plugin-sync`                                       |
| `SyncType.QueryCache` entities                                 | `+ @aiao/rxdb-plugin-querycache` (all three together, see below) |

The sync plugin declares `inject: ['plugin:history']`: the history plugin is a hard prerequisite before it can become active. **Installing sync requires installing history too.** With only sync installed, the host does not install it and warns once; the `rxdb.syncManager` slot therefore does not exist.

## 1. Install and register

```bash
pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync
```

```diff
 import { RxDB, SyncType } from '@aiao/rxdb';
+import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
+import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

 const rxdb = new RxDB({ dbName: 'my-app', entities: [Todo] , sync: { … } });
 rxdb.adapter('wa-sqlite', /* … */).adapter('supabase', /* … */);
+// Order is irrelevant: the host sorts by `inject` topology, history is always installed first
+rxdb.use(rxDBPluginHistory);
+rxdb.use(rxDBPluginSync);

 await rxdb.connect('wa-sqlite');
```

`use()` takes the **plugin factory function itself**; do not call it (`rxdb.use(rxDBPluginSync)`, not `rxdb.use(rxDBPluginSync())`).

## 2. Sync methods move to a new mount point

Sync as a whole moved from `rxdb.versionManager` to `rxdb.syncManager`:

```diff
-await rxdb.versionManager.syncRepository('public', 'Todo');
-await rxdb.versionManager.push();
-await rxdb.versionManager.pull();
+await rxdb.syncManager.syncRepository('public', 'Todo');
+await rxdb.syncManager.push();
+await rxdb.syncManager.pull();
```

### Members that moved to `rxdb.syncManager`

| Method                                                    | Purpose                                       |
| --------------------------------------------------------- | --------------------------------------------- |
| `pull` / `push` / `sync`                                  | Whole-database push and pull                  |
| `pullRepository` / `pushRepository` / `syncRepository`    | Per-repository push and pull                  |
| `bulkSync`                                                | Batch sync in dependency order                |
| `syncBranches`                                            | Branch table sync                             |
| `cleanupExpired`                                          | Remove rows that no longer satisfy the filter |
| `checkRepositoryUpdates`                                  | Probe whether the remote has new changes      |
| `getRepositorySyncStatus` / `getAllRepositorySyncStatus`  | Sync status queries                           |
| `refreshPullableCount`                                    | Recompute the pending pull count              |
| `getRepositoryDependencyGraph` / `getRepositorySyncOrder` | Repository dependency order                   |

### Members that stay on `rxdb.versionManager`

| Method                                           | Purpose                           |
| ------------------------------------------------ | --------------------------------- |
| `createBranch` / `removeBranch` / `switchBranch` | Create / remove / switch branches |
| `mergeBranch`                                    | Merge branches                    |
| `history()`                                      | History scope API                 |
| `restoreEntity`                                  | Restore an entity from history    |
| `resetSessionState`                              | Reset session state               |

`getLocalRepositories` / `getRemoteRepositories` / `getCurrentBranch` exist on **both sides**; call them through whichever manager you already hold — no need to change mount points for them.

## 3. When the slots are available

Both slots are mounted by the plugins with `Object.defineProperty` inside the connection epoch and removed on disconnect:

```ts
const rxdb = new RxDB({ … });
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);

rxdb.versionManager; // ❌ undefined — not connected yet

await rxdb.connect('wa-sqlite');

rxdb.versionManager; // ✅
rxdb.syncManager; // ✅

await rxdb.disconnectAll();

rxdb.syncManager; // ❌ slot removed
```

Without the plugins installed, reading either slot yields `undefined`, **not** a do-nothing shell — core does not provide fallbacks.

## 4. Symptoms of a missing package

| Symptom                                                                         | Cause                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Type does not exist at the import (`Property 'versionManager' …`)               | `@aiao/rxdb-plugin-history` is not installed                                         |
| Type exists, runtime `undefined`                                                | The package is installed but not `use()`d, or `await connect()` has not happened yet |
| `rxdb.syncManager` is always `undefined`, one dependency warning in the console | Sync is installed but history is not                                                 |
| `versionManager.syncRepository is not a function`                               | Sync methods moved to `syncManager` (see the table above)                            |

## QueryCache applications need all three packages

Entities that declare `SyncType.QueryCache` check two slots at `connect()`: the read engine comes from the querycache plugin, and **the offline write outbound queue comes from the sync plugin**. Such applications therefore need all three packages — history + sync + querycache; missing any one throws `RxDBMissingPluginError` from `connect()`. See [Query-cache read engine split](./querycache-plugin.md).

## See also

- [Sync strategy](../collaboration/sync.md): the full `syncManager` usage
- [Branch management](../collaboration/branch.md): the `versionManager` branch APIs
- [Query-cache read engine split](./querycache-plugin.md)
- [Plugin lifecycle migration](./plugin-scope.md): the `install(scope)` contract and epoch revocation
- [Versioning and API stability](../versioning.md)

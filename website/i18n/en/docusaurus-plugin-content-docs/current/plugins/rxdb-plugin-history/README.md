# @aiao/rxdb-plugin-history

> Implements: [US-025 core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

History, undo/redo, and branches. Install it and `rxdb.versionManager` exists.

Core `@aiao/rxdb` keeps the **primitives**: three system tables (`RxDBBranch` / `RxDBChange` / `RxDBSync`), change encoding, the conflict model, sync eligibility checks, and `getCurrentBranch()`. These are not exclusive to the history subsystem — change log triggers write `branchId` directly, `RxDBChange.branch` generates a real `REFERENCES rxdb$rxdb_branch(id)` foreign key, and the whole reactive incremental pipeline runs on `rxdb_change`. What moved into this package are the **consumers**: reading history, undo/redo, and creating / switching / merging / removing branches.

Push-pull sync scheduling is **not here** — it lives in [@aiao/rxdb-plugin-sync](../rxdb-plugin-sync/README.md): `rxdb.syncManager.push()` / `.pull()` / `.sync()`. That plugin declares `inject: ['plugin:history']`, and the dependency is one-directional — this package does not know about the sync package.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-history
```

## Usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

const rxdb = new RxDB({
  dbName: 'notes',
  entities: [Note],
  sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
});

// Pass the factory function itself, do not call it; must run before connect() — connect() calls init() internally
rxdb.use(rxDBPluginHistory).adapter('wa-sqlite' /* … */);

await rxdb.connect('wa-sqlite');

// Undo and redo
await rxdb.versionManager.history().undo();
await rxdb.versionManager.history(Note).redo(2);

// Branches: make changes on feature-a, switch back to main, then merge feature-a into the current branch
await rxdb.versionManager.createBranch('feature-a');
await rxdb.versionManager.switchBranch('feature-a');
// …changes on feature-a…
await rxdb.versionManager.switchBranch('main');
await rxdb.versionManager.mergeBranch('feature-a');
```

When `use()` runs matters: called before `init()`, the plugin is installed during `init()`; called after, it installs immediately — and `connect()` calls `init()` internally. Write it after `connect()` and the first batch of changes has already missed the history subscription.

## Main capabilities

| Group    | Entry points                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| History  | `history(scope?)` → `histories$` / `undoHistories$` / `redoHistories$` / `count$` / `undoBarrier$` / `redoBarrier$` / `undo()` / `redo()` |
| Branches | `createBranch()` / `switchBranch()` / `mergeBranch()` / `removeBranch()`                                                                  |
| Compare  | `compareBranches()` / `previewMerge()`: compare two branches and preview a merge (with overwrite annotations) without switching branches  |
| Counts   | `pushableCount$` / `pullableCount$`                                                                                                       |
| Restore  | `restoreEntity()`                                                                                                                         |

`history()` resolves its scope from the argument: no argument = the whole database, an entity class = that repository, an instance = that row. Undoing a cross-scope transaction throws `RxDBCrossScopeTransactionError` instead of undoing half of it — half a transaction is much harder to debug than a failure.

**Undo / redo stop at a child branch's fork point.** Changes on the current branch that are no later than a child branch's fork point have been inherited by that child branch: undoing or redoing them would make the reverse patches the child recorded stale, so switching back to the current branch would read wrong values, and comparisons and merge previews would be distorted too. Therefore they do not enter `undoHistories$`, and `undo()` / `redo()` do nothing when they reach that step; `undoBarrier$` / `redoBarrier$` give the reason (`{ reason: 'inherited_by_branch', branchIds }`) for the UI to explain why the button is disabled. Changes made before creating a branch cannot be undone once the branch exists — the same reason git does not rewrite the history a branch is based on; the restriction lifts after you delete the child branches that inherited them. To change it back, just make the change again.

When the instance is mounted on a writable checkout (the working-tree plugin's `checkouts.mount()`), the current branch is the branch that table set holds: `mergeBranch()` merges into it and lands in that table set, and only entities that exist in that table set are merged; `previewMerge()` and `compareBranches()` use the same criterion (only list members of that table set: entities outside the shadow table set do not move when switching branches in a checkout); the pushable count is 0 (only the main checkout syncs). A branch held by a writable checkout cannot be removed with `removeBranch()` — it throws `WorktreeBranchHeldError`.

## Without the plugin

`rxdb.versionManager` **does not exist** (it reads `undefined`); core does not provide a do-nothing shell. This is a visible contract for downstream consumers, not a degraded path:

- **DevTools**: `DevToolsRxDB.versionManager` is an optional member; the connector honestly reports "branch capability unavailable" instead of pretending there are "no branches".
- **Sync state hub**: `SyncStateHub` stays in core, but the pushable count is wired by this plugin through `bindPushableCount()`. Without the plugin, that reading is simply unmaintained — which is the truth. The pullable count belongs to `@aiao/rxdb-plugin-sync`: it picks up the `requestPullableRefresh()` calls that remote adapters emit.
- **Types**: `versionManager` is declared by this package's `declare module '@aiao/rxdb'`. Modules that only consume it without installing it (framework components, shared UI) should write `import type {} from '@aiao/rxdb-plugin-history';` — it pulls the type declarations into the compilation unit and is fully erased at emit time, so it creates no runtime dependency.

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; all three host mutations are registered on the scope received by `install(scope)` and released in reverse order on `disconnectAll()` — the host never calls `destroy()`: the `VersionManager` instance itself (with its `destroy()`), the `rxdb.versionManager` slot, and the `syncState.bindPushableCount()` subscription. A new `connect()` installs a brand-new manager instead of reviving the previous epoch's — the event bus the latter points to has been torn down.

This package declares **no `inject`**, so it finishes installing during `init()`; `@aiao/rxdb-plugin-sync` declares `inject: ['plugin:history']` and waits for this package — that slot only exists after `await connect()`.

The plugin declares **no `inject`**: `VersionManager.init()` only attaches listeners and subscriptions and issues not a single adapter read or write. Declaring `adapter:local` would push installation behind the bootstrap chain, but the branch stream must be subscribed before the first `rxdb_change` event arrives.

## Migration

To upgrade from the version where `versionManager` hung directly on core, see [History and sync extraction](../../migration/history-sync-plugins.md).

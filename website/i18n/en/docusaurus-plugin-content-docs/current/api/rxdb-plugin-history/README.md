# rxdb-plugin-history

> Implements: [US-025 Core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

History, undo/redo and branches. Once installed, `rxdb.versionManager` exists.

What the core `@aiao/rxdb` keeps is the **primitives**: the three system tables (`RxDBBranch` / `RxDBChange` / `RxDBSync`), change encoding/decoding, the conflict model, sync eligibility checks, and `getCurrentBranch()`. These are not exclusive to the history subsystem — the change log trigger writes `branchId` directly, `RxDBChange.branch` generates a real `REFERENCES rxdb$rxdb_branch(id)` foreign key, and the whole reactive incremental pipeline runs on `rxdb_change`. What moves into this package is the **consumer**: reading history, undo/redo, and creating/switching/merging/deleting branches.

Push/pull sync scheduling is **not here**; it lives in [`@aiao/rxdb-plugin-sync`](../rxdb-plugin-sync/README.md): `rxdb.syncManager.push()` / `.pull()` / `.sync()`. That plugin declares `inject: ['plugin:history']`, with no dependency in the other direction — this package does not know the sync package.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-history
```

## Usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

const rxdb = new RxDB({
  dbName: 'notes',
  entities: [Note],
  sync: `{ type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }`
});

// Pass the factory function itself, do not call it; must run before connect() — connect() calls init() internally
rxdb.use(rxDBPluginHistory).adapter('wa-sqlite' /* … */);

await rxdb.connect('wa-sqlite');

// Undo / redo
await rxdb.versionManager.history().undo();
await rxdb.versionManager.history(Note).redo(2);

// Branches: edit on feature-a, switch back to main, then merge feature-a into the current branch
await rxdb.versionManager.createBranch('feature-a');
await rxdb.versionManager.switchBranch('feature-a');
// …edits on feature-a…
await rxdb.versionManager.switchBranch('main');
await rxdb.versionManager.mergeBranch('feature-a');
```

The timing of `use()` matters: `use()` before `init()` installs the plugin during `init()`, afterwards it installs immediately, and `connect()` calls `init()` internally. Written after `connect()`, the first batch of changes has already missed the history subscription.

## Main capabilities

| Group      | Entries                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| History    | `history(scope?)` → `histories$` / `undoHistories$` / `redoHistories$` / `count$` / `undoBarrier$` / `redoBarrier$` / `undo()` / `redo()` |
| Branches   | `createBranch()` / `switchBranch()` / `mergeBranch()` / `removeBranch()`                                                                  |
| Comparison | `compareBranches()` / `previewMerge()`: compare two branches and preview a merge (with overwrite annotations) without switching branches  |
| Counts     | `pushableCount$` / `pullableCount$`                                                                                                       |
| Restore    | `restoreEntity()`                                                                                                                         |

The scope of `history()` resolves from the argument: no argument = the whole database, an entity class = that repository, an instance = that row. Undoing a cross-scope transaction throws `RxDBCrossScopeTransactionError` instead of undoing only half — half a transaction is far harder to diagnose than a failure.

**Undo / redo stop at the fork point of child branches.** Changes on the current branch no newer than some child branch's fork point have already been inherited by that child branch: undoing or redoing them would stale the reverse patches recorded on the child branch, produce wrong values when switching back to the current branch, and distort comparisons and merge previews. So they do not appear in `undoHistories$`, and `undo()` / `redo()` do nothing when reaching that step; `undoBarrier$` / `redoBarrier$` give the reason (`{ reason: 'inherited_by_branch', branchIds }`), which the UI uses to explain why a button is disabled. Changes made before creating a branch cannot be undone after the branch exists — same as the rule that git never rewrites the history a branch is based on; the restriction lifts after deleting the child branches that inherited them. To change them back, just make the change again.

When an instance is mounted on a writable checkout (the working tree plugin's `checkouts.mount()`), the current branch is the branch held by that table set: `mergeBranch()` merges into it and lands in that table set, only merging entities that belong to it; `previewMerge()` and `compareBranches()` follow the same rule (only listing members of that table set: entities not in the shadow table set stay untouched when switching branches in the checkout); the pushable count is 0 (only the main checkout syncs). A branch held by a writable checkout cannot be removed with `removeBranch()` — it throws `WorktreeBranchHeldError`.

## Without the plugin

`rxdb.versionManager` **does not exist** (reads `undefined`); the core does not provide a no-op shell. This is a visible contract for downstream, not a degraded path:

- **DevTools**: `DevToolsRxDB.versionManager` is an optional member, and connectors truthfully report "branch capability unavailable" instead of lying that "there are no branches".
- **Sync state hub**: `SyncStateHub` stays in the core, but the pushable count is wired by this plugin via `bindPushableCount()`. Without the plugin, that reading is simply unmaintained — which is the truth. The pullable count belongs to `@aiao/rxdb-plugin-sync`: it catches the `requestPullableRefresh()` emitted by remote adapters.
- **Types**: `versionManager` is declared by this package's `declare module '@aiao/rxdb'`. Modules that only consume it without installing (framework components, shared UI) should write `import type {} from '@aiao/rxdb-plugin-history';` — it pulls the type declaration into the compilation unit while being fully erased at emit time, producing no runtime dependency.

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; all three host mutations are registered on the scope received by `install(scope)` and released in reverse order on `disconnectAll()`, with the host never calling `destroy()`: the `VersionManager` instance itself (together with `destroy()`), the `rxdb.versionManager` slot, and the `syncState.bindPushableCount()` subscription. Re-`connect()`ing installs a brand-new manager rather than resurrecting the previous epoch's — the event bus that one points to has already been dismantled.

This package **declares no `inject`**, so it finishes installing during `init()`; `@aiao/rxdb-plugin-sync` declares `inject: ['plugin:history']`, so it waits for this package, and that slot only exists after `await connect()`.

The plugin **declares no `inject`**: `VersionManager.init()` only attaches listeners and subscriptions and issues no adapter reads or writes. Declaring `adapter:local` would push installation behind the bootstrap chain, while the branch stream must be subscribed before the first `rxdb_change` event arrives.

`@aiao/rxdb-plugin-history` — history, undo/redo and branches.

## Remarks

The core `@aiao/rxdb` keeps only the **primitives**: the three system tables (RxDBBranch / `RxDBChange` /
`RxDBSync`), change encoding/decoding, the conflict model and sync eligibility checks. The reason is that these do not belong to the history subsystem —
the change log trigger writes `branchId` directly, `RxDBChange.branch` generates a real
`REFERENCES rxdb$rxdb_branch(id)` foreign key, and the whole reactive incremental pipeline runs on `rxdb_change`.

What moves into this package is the **consumer**: reading history, undo/redo, and creating/switching/merging/deleting branches.

Push/pull sync scheduling is **not here**. After US-025 phase D it lives in `@aiao/rxdb-plugin-sync`:
`rxdb.syncManager.push()` / `.pull()` / `.sync()`. That plugin declares `inject: ['plugin:history']`,
with no dependency in the other direction — this package does not know the sync package.

## Example

```ts
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

rxdb.use(rxDBPluginHistory);
await rxdb.connect();

// Undo / redo goes through the scoped API: no argument = the whole database, an entity class = that repository, an instance = that row
await rxdb.versionManager.history().undo();
```

## Classes

| Class                                                                       | Description                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [PushInFlightRegistry](classes/PushInFlightRegistry.md)                     | In-process registry of "which changes are currently flying to the remote". |
| [RxDBCrossScopeTransactionError](classes/RxDBCrossScopeTransactionError.md) | Scoped undo / redo hit a cross-scope transaction                           |
| [RxDBPluginHistory](classes/RxDBPluginHistory.md)                           | History / undo-redo / branch plugin.                                       |

## Interfaces

| Interface                                                            | Description                                                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [BranchComparison](interfaces/BranchComparison.md)                   | The answer of `VersionManager.compareBranches()`.                                                                                 |
| [BranchDiffEntry](interfaces/BranchDiffEntry.md)                     | The difference of one entity between two branches.                                                                                |
| [MergePreview](interfaces/MergePreview.md)                           | The answer of `VersionManager.previewMerge()`.                                                                                    |
| [MergePreviewEntry](interfaces/MergePreviewEntry.md)                 | An entity a merge would land on the target branch.                                                                                |
| [MergePreviewOptions](interfaces/MergePreviewOptions.md)             | Options of `VersionManager.previewMerge()`.                                                                                       |
| [NewBranchRowInput](interfaces/NewBranchRowInput.md)                 | Input of [write\_new\_branch](functions/write_new_branch.md): a new branch's position in the tree, plus an optional named commit. |
| [PushInFlightSession](interfaces/PushInFlightSession.md)             | The claim handle held during one push call.                                                                                       |
| [SwitchBranchActionReaders](interfaces/SwitchBranchActionReaders.md) | The minimal repository capabilities needed to compute switch-branch actions.                                                      |
| [SwitchBranchStep](interfaces/SwitchBranchStep.md)                   | Branch switch step                                                                                                                |
| [SyncHistoryBridge](interfaces/SyncHistoryBridge.md)                 | The history-side capabilities visible to the sync plugin.                                                                         |
| [VersionManager](interfaces/VersionManager.md)                       | Version manager                                                                                                                   |

## Type Aliases

| Type Alias                                                           | Description                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [BranchDiffOperation](type-aliases/BranchDiffOperation.md)           | The net operation of one entity between the two sides.                                   |
| [MergePreviewConflict](type-aliases/MergePreviewConflict.md)         | The four situations where a merge hits changes made on the target branch since the fork. |
| [RxDBPluginHistoryOptions](type-aliases/RxDBPluginHistoryOptions.md) | This plugin currently accepts no options                                                 |

## Variables

| Variable                                            | Description             |
| --------------------------------------------------- | ----------------------- |
| [rxDBPluginHistory](variables/rxDBPluginHistory.md) | History plugin factory. |

## Functions

| Function                                                                                  | Description                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [assert\_branch\_id\_free\_on\_remote](functions/assert_branch_id_free_on_remote.md)      | Rejects when the remote already has a branch with the same name.                                                                                      |
| [compute\_switch\_branch\_actions](functions/compute_switch_branch_actions.md)            | Uses the given repositories to compute the writes for "switching from the current active branch to `branchId`" — the body of switch\_branch\_actions. |
| [find\_branch\_path\_to\_root](functions/find_branch_path_to_root.md)                     | Walks `parentId` from a branch to the root of its tree, returning all branches passed through (including itself, with the root last).                 |
| [find\_switch\_branch\_step](functions/find_switch_branch_step.md)                        | Computes the switch path between two nodes in the tree                                                                                                |
| [forkPointOf](functions/forkPointOf.md)                                                   | Reads a branch's fork point change id.                                                                                                                |
| [get\_branch\_max\_change](functions/get_branch_max_change.md)                            | Reads a branch's current tip: the largest-id change among its own un-reverted changes.                                                                |
| [get\_switch\_version\_actions](functions/get_switch_version_actions.md)                  | Folds a sequence of changes into the writes for switching versions.                                                                                   |
| [isIgnorableDetachedVersionEventError](functions/isIgnorableDetachedVersionEventError.md) | Decides whether an error of a detached event task is ignorable                                                                                        |
| [keep\_table\_set\_actions](functions/keep_table_set_actions.md)                          | The increment keeps only entities managed by this table set; the rule is table\_set\_scope.                                                           |
| [write\_new\_branch](functions/write_new_branch.md)                                       | Writes a new branch inside the caller's transaction: the branch row, plus the rows of each system contributor.                                        |

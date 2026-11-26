# rxdb-plugin-working-tree

RxDB local working tree and commit history plugin: adds "uncommitted changes" and "commit history" as first-class concepts to `@aiao/rxdb`.

A database without this package installed is **zero-cost** — the eleven system tables, write capture, and commit graph codec all ship with the package; the core only keeps the install/uninstall hooks and two hand-off gates.

## Capability scope

- Write capture: user edits land in the working tree instead of directly changing main data; the database's own bookkeeping writes are not captured
- `status()` / `diff()`: read the current branch's uncommitted summary and per-change entries
- `commit()`: commit **all** uncommitted units in the working tree as one snapshot; CAS failures go through the return value instead of exceptions
- `discard()`: revert the entire working tree back to HEAD
- `listCommits()`: read the reachable commit history of the current branch
- `restore()` / `restoreSession()`: write the contents of a reachable historical commit back into the working tree as **new uncommitted changes**; does not move HEAD, does not delete history, four rejection causes go through the return value
- `switchBranch()` with two optional preconditions (`requireClean` / `expectedActivationRevision`); mounted on `@aiao/rxdb-plugin-history`'s `db.versionManager`, rejections **go through exceptions**
- `checkouts`: checkouts. A read-only checkout does not switch branches and does not touch the working tree; it builds the complete data of another branch or of a reachable commit on the current branch into a read-only snapshot,
  browsed with a second read-only instance; the snapshot database is provided by the plugin option `worktrees.adapter`, same backend as the main database, each with its own database name (PGlite and the six SQLite-family backends).
  A writable checkout (`add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()`) is a set of shadow tables in the same database; the main instance mounts it to read, write, commit,
  switch branches, and merge, without touching the main checkout; a branch can only be held by one checkout, and instances mounted on a writable checkout do not sync

## Six things to know before using

The full version is on the documentation site's [plugin page](https://rxdb.aiao.io/docs/plugins/rxdb-plugin-working-tree); here is the condensed version:

1. **Commit capability is an explicit database-level switch** — call `enable()` once and all entities, all branches of the entire database run under working tree semantics. Enabling leaves a capability watermark row; **clients without this package installed refuse to connect to this database from then on**; v1 has no `disable()`.
2. **The working tree is not a draft cache.** The working tree holds changes that "have already been written to the database but not yet committed as a snapshot"; they participate in transactions and are read by queries. The draft cache (`@aiao/rxdb-plugin-workspace`) holds "not yet saved" editor buffers that never entered the main database. The two layers cannot be merged, which is why this package does not claim the `Workspace*` prefix.
3. **`restore()` is not a checkout.** It writes historical contents back into the working tree as new uncommitted changes: HEAD does not move, history is not deleted, the working tree becomes dirty, and the next step is `commit()` or `discard()`. v1 has no detached HEAD and no `checkout()`.
4. **History preserves sensitive old values verbatim.** A field written into a commit stays in that commit's `ChangeSet` forever; later edits, clears, or row deletions never touch it. v1 has no public API that can dig it out of history. **Do not write anything that should not leave a trace into a database with commit capability enabled.**
5. **Encryption boundary**: encrypted fields still land on disk as versioned envelopes in commits, the working tree, and restore sessions; the persistence path does not decrypt and then write plaintext, and errors and summaries do not carry plaintext. But encryption protects the **bytes on disk** — it does not dissolve item 4, and item 4 cannot replace it.
6. **No history rewriting**: no amend / rebase / squash, no "modify commit message", and no auto-baseline. When the commit graph is corrupted, the guard only sets `corrupted_read_only` and leaves diagnostics; it **does not move HEAD and does not delete records**.

Another one that is often missed: **changes pulled down by remote sync enter the working tree just like user edits**; in `status().byOrigin` they count as `origin = 'remote_sync'`, are **not exempt**, make `clean` become `false`, and are committed together by the next `commit()` (the committer is that `commit()` call's `authorId`; v1 does not forge the remote author). "The working tree suddenly became dirty after sync" is normal behavior.

Only four categories never enter version control: entities of `SyncType.QueryCache`, the `remoteId` and audit timestamps on entity rows, derived index columns registered by plugins, and entities with change logging disabled (`@Entity({ log: false })`) such as the storage plugin's file metadata. Their changes never appear in `status()` / `diff()` / `commit()`, and `restore()` does not bring them back.

## Capability boundary: writes that bypass the adapter cannot be stopped

Write capture only covers **write paths that go through the adapter and the bulk write methods the adapter exposes**. Directly opening the same SQLite file, starting another PGlite instance, hand-written SQL in DevTools — these **cannot be stopped, and v1 does not promise to stop them**; they do not enter the working tree, do not enter history, and are invisible to `status()`.

Therefore a database with commit capability enabled has one hard constraint: **business tables may only be written through RxDB**. This is not a disclaimer footnote — not pretending to stop what cannot be stopped matters more than failing to stop it: a gate that claims to stop writes but does not makes people mistake "no error" for "not bypassed".

## Usage

```ts
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← must come before connect()
await db.connect('sqlite-wasm');

await db.workingTree.enable(); // on an existing database this is a migration; on a new one, an idempotent confirmation

const status = await db.workingTree.status();
const result = await db.workingTree.commit('Save', {
  expectedBranch: {
    branchId: status.branchId,
    activationRevision: status.activationRevision
  },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision,
  authorId: 'alice',
  operationId: crypto.randomUUID()
});
if (!result.ok) {
  // someone else committed first: conflict carries the new revision; re-read status and retry
  console.warn(result.conflict);
}
```

**`use()` must come before `connect()`.** This plugin declares `system` (`RxDBSystemContribution`);
the host must read its entities, initial rows, and migrations before creating tables; calling `use()` after `connect()` is already too late for table creation,
and the core throws on the spot instead of silently skipping.

The two `switchBranch()` preconditions are not on this package's entry point: `db.versionManager` is mounted by
[`@aiao/rxdb-plugin-history`](../rxdb-plugin-history/README.md) within the connection epoch; the core does not create it automatically.
Using only the working tree and commits does not need it; to use `switchBranch()` install it with `use()` as well, otherwise `db.versionManager`
is `undefined` — the core provides no fallback.

```ts
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

db.use(rxDBPluginWorkingTree);
db.use(rxDBPluginHistory);
```

`db.workingTree` is a **non-optional** member, augmented via `declare module '@aiao/rxdb'`: this entry exists only when the package is installed;
without it, `db.workingTree` is a compile error rather than a runtime `undefined`. It is still present when the capability is not enabled,
but every method rejects with `commit_capability_disabled`.

## Unclaimed capability guard

A database that has been `enable()`d leaves a capability watermark row in `rxdb_migration` (`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`).
**When a client without this package opens the database again, the core refuses the connection** and reports the package name to install verbatim:

```
This database has enabled an RxDB capability not claimed by the current process; without the corresponding plugin, writes are not governed by that capability, so the connection is refused:
  - workingTree v1 —— install @aiao/rxdb-plugin-working-tree
```

This guard is the core benefit of extracting this package out of the core: it replaces the old approach of bumping `RXDB_SYSTEM_SCHEMA_VERSION`
to lock out old clients, and it **works for third-party plugins too** — the package name is written into the watermark row by the plugin itself, and the core does not need to recognize it.

## System tables

Eleven of them, in creation order:

`CommitCapabilityState`, `WorkingTreeActivationState`, `Commit`, `CommitChangeSet`, `CommitBranchRef`,
`WorkingTreeState`, `WorkingTreeEntry`, `WorkingTreeRestoreSession`, `WorkingTreeMaterializationStage`,
`WorkingTreeMaterializationPage`, `Worktree` (the checkout registry table, shared by read-only and writable checkouts).

They enter the core's system-table identity set via `registerSystemEntities()`, so `isSystemEntity()` recognizes them —
cross-package consumers such as `@aiao/rxdb-adapter-http` will not push them to the remote as adapter-side data.

## Framework bindings

- Angular —— [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular/README.md)
- React —— [`@aiao/rxdb-plugin-working-tree-react`](../rxdb-plugin-working-tree-react/README.md)
- Vue —— [`@aiao/rxdb-plugin-working-tree-vue`](../rxdb-plugin-working-tree-vue/README.md)

The three `useWorkingTree()` and the read-only checkouts' `useWorktrees()` share the same names and semantics across all three; only the state container shape differs (`Signal` / render snapshot / `ComputedRef`).

## Conformance suite

`@aiao/rxdb-plugin-working-tree/testing` exports a cross-backend conformance suite (capture + commit + worktree);
each of the six adapter packages (electron / sqlite / sqlite-wasm / pglite / sqliteai / wa-sqlite) references three of them.

## Development commands

```bash
pnpm nx run rxdb-plugin-working-tree:typecheck
pnpm nx run rxdb-plugin-working-tree:lint --max-warnings=0
pnpm nx test rxdb-plugin-working-tree
pnpm nx run rxdb-plugin-working-tree:build
```

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Classes

| Class                                                                                 | Description                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [BranchNotMaterializedError](classes/BranchNotMaterializedError.md)                   | Insufficient materialization evidence; the whole attempt rolls back fully with `branch_not_materialized` (FR-044). |
| [ColdReplayMismatchError](classes/ColdReplayMismatchError.md)                         | A cold replay invariant was violated.                                                                              |
| [CommitEncryptedAtRestError](classes/CommitEncryptedAtRestError.md)                   | A value in an encrypted column entered a commit without its at-rest form (FR-038).                                 |
| [CommitValidationError](classes/CommitValidationError.md)                             | Input failed validation; thrown **before any read or write**.                                                      |
| [MixedVersionedCacheTransactionError](classes/MixedVersionedCacheTransactionError.md) | QueryCache entities and other entities were mixed into the same transaction unit                                   |
| [RxDBPluginWorkingTree](classes/RxDBPluginWorkingTree.md)                             | The plugin lifecycle object that installs the working tree and commit history on a single RxDB instance.           |
| [StaleActiveBranchError](classes/StaleActiveBranchError.md)                           | The active branch token held by the caller has expired                                                             |
| [UnknownWorkingTreePatchEntityError](classes/UnknownWorkingTreePatchEntityError.md)   | Error thrown on the encoding side when the target entity is not registered in this process.                        |
| [WorkingTreeCapabilityDisabledError](classes/WorkingTreeCapabilityDisabledError.md)   | A managed member was called on a database where commit capability is not enabled.                                  |
| [WorkingTreeCaptureRuntime](classes/WorkingTreeCaptureRuntime.md)                     | Capture runtime                                                                                                    |
| [WorkingTreeDirtyError](classes/WorkingTreeDirtyError.md)                             | The switch was rejected because the working tree is not empty (FR-017).                                            |
| [WorkingTreeEntryCountMismatchError](classes/WorkingTreeEntryCountMismatchError.md)   | The redundant column does not match the actual entry row count.                                                    |
| [WorkingTreeManager](classes/WorkingTreeManager.md)                                   | Entry point for the working tree and commit history (contract in contracts/core-api.md §1).                        |
| [WorkingTreeReplayCorruptionError](classes/WorkingTreeReplayCorruptionError.md)       | A working tree unit violated the fold invariant                                                                    |
| [WorkingTreeWriteRejectedError](classes/WorkingTreeWriteRejectedError.md)             | A write rejected by the gate                                                                                       |
| [Worktree](classes/Worktree.md)                                                       | The registration row of a checkout.                                                                                |
| [WorktreeManager](classes/WorktreeManager.md)                                         | Entry point for checkouts: `rxdb.workingTree.checkouts`.                                                           |
| [WorktreeUnavailableError](classes/WorktreeUnavailableError.md)                       | The checkout could not be opened, or could not be renamed.                                                         |

## Interfaces

| Interface                                                                              | Description                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ActiveBranchToken](interfaces/ActiveBranchToken.md)                                   | The active branch identity captured by the caller when **reading / instantiating entities** (FR-020)                                                                                                                                                                    |
| [BulkWriteGateRequest](interfaces/BulkWriteGateRequest.md)                             | Judgment input for one bulk write                                                                                                                                                                                                                                       |
| [CapturedWrite](interfaces/CapturedWrite.md)                                           | One captured write                                                                                                                                                                                                                                                      |
| [ChangeCaptureSource](interfaces/ChangeCaptureSource.md)                               | The `rxdb_change` columns capture needs                                                                                                                                                                                                                                 |
| [ColdReplayIdentity](interfaces/ColdReplayIdentity.md)                                 | The identity of one business data row; identical to the part of the working tree unit's unique index except for `branchId`.                                                                                                                                             |
| [ColdReplayInvariantInput](interfaces/ColdReplayInvariantInput.md)                     | Input to [assertColdReplayInvariant](functions/assertColdReplayInvariant.md).                                                                                                                                                                                           |
| [ColdReplayRow](interfaces/ColdReplayRow.md)                                           | One row of business data: identity + all column values.                                                                                                                                                                                                                 |
| [CommitCapabilityInfo](interfaces/CommitCapabilityInfo.md)                             | Read-only view of the one capability state row in the database.                                                                                                                                                                                                         |
| [CommitCapabilityVersions](interfaces/CommitCapabilityVersions.md)                     | The three capability version numbers supported by this process.                                                                                                                                                                                                         |
| [CommitChangeSetPage](interfaces/CommitChangeSetPage.md)                               | One page returned by commitChanges: all change units of one commit, in write order.                                                                                                                                                                                     |
| [CommitChangeUnitContent](interfaces/CommitChangeUnitContent.md)                       | The part of a unit's content that enters the summary — exactly the nine columns persisted in `CommitChangeSet`.                                                                                                                                                         |
| [CommitConflict](interfaces/CommitConflict.md)                                         | Typed diagnostics for a rejected commit / discard (contracts/core-api.md §4.1).                                                                                                                                                                                         |
| [CommitLogEntry](interfaces/CommitLogEntry.md)                                         | One commit node in the history.                                                                                                                                                                                                                                         |
| [CommitLogOptions](interfaces/CommitLogOptions.md)                                     | Input to one `listCommits()` call (contracts/core-api.md §5).                                                                                                                                                                                                           |
| [CommitLogPage](interfaces/CommitLogPage.md)                                           | Result of one `listCommits()` call.                                                                                                                                                                                                                                     |
| [CommitOptions](interfaces/CommitOptions.md)                                           | Input to one `commit()` call (contracts/core-api.md §4).                                                                                                                                                                                                                |
| [CommitPatchCodecContext](interfaces/CommitPatchCodecContext.md)                       | Context needed by commit-side patch codec and at-rest validation.                                                                                                                                                                                                       |
| [ExpectedActiveBranch](interfaces/ExpectedActiveBranch.md)                             | The active branch assertion **proposed** by the caller (type of [StaleActiveBranchError.expected](classes/StaleActiveBranchError.md#expected))                                                                                                                          |
| [ExternalNotifyGateRequest](interfaces/ExternalNotifyGateRequest.md)                   | Judgment input for one external update notification                                                                                                                                                                                                                     |
| [RawWriteJudgmentContext](interfaces/RawWriteJudgmentContext.md)                       | Judgment context for one raw call                                                                                                                                                                                                                                       |
| [RestoreIncompatibility](interfaces/RestoreIncompatibility.md)                         | Stable description of the first incompatible node (FR-050).                                                                                                                                                                                                             |
| [RestoreVersionManifest](interfaces/RestoreVersionManifest.md)                         | Version manifest: the two values the user compares against "what I have here".                                                                                                                                                                                          |
| [RxDBPluginWorkingTreeOptions](interfaces/RxDBPluginWorkingTreeOptions.md)             | Options for [rxDBPluginWorkingTree](variables/rxDBPluginWorkingTree.md).                                                                                                                                                                                                |
| [VersionedDomain](interfaces/VersionedDomain.md)                                       | Complete view of the versioned domain: the table / column plane (inherited from [VersionedDomainView](interfaces/VersionedDomainView.md)) plus the entity plane                                                                                                         |
| [VersionedDomainEntityInput](interfaces/VersionedDomainEntityInput.md)                 | A single entity registration needed to build the versioned domain                                                                                                                                                                                                       |
| [VersionedDomainView](interfaces/VersionedDomainView.md)                               | The versioned domain projected on the **table / column** plane — the port consumed by raw write judgment                                                                                                                                                                |
| [VersionedTransactionGuard](interfaces/VersionedTransactionGuard.md)                   | Guard against mixing QueryCache / other entities within one transaction unit                                                                                                                                                                                            |
| [WorkingTreeActivationInfo](interfaces/WorkingTreeActivationInfo.md)                   | Read-only view of the single activation state row.                                                                                                                                                                                                                      |
| [WorkingTreeAsyncStates](interfaces/WorkingTreeAsyncStates.md)                         | All state held by the three framework entry points, one field per capability.                                                                                                                                                                                           |
| [WorkingTreeCaptureBatch](interfaces/WorkingTreeCaptureBatch.md)                       | Capture context shared by one batch of changes                                                                                                                                                                                                                          |
| [WorkingTreeCaptureHost](interfaces/WorkingTreeCaptureHost.md)                         | Host capabilities needed by [createWorkingTreeCapturePort](functions/createWorkingTreeCapturePort.md).                                                                                                                                                                  |
| [WorkingTreeCaptureMountPoint](interfaces/WorkingTreeCaptureMountPoint.md)             | A write primitive on which working tree capture must be mounted.                                                                                                                                                                                                        |
| [WorkingTreeCapturePort](interfaces/WorkingTreeCapturePort.md)                         | Persistence operations needed by capture                                                                                                                                                                                                                                |
| [WorkingTreeCaptureRuntimeOptions](interfaces/WorkingTreeCaptureRuntimeOptions.md)     | Host capabilities needed to build the capture runtime.                                                                                                                                                                                                                  |
| [WorkingTreeCommands](interfaces/WorkingTreeCommands.md)                               | The fourteen commands exposed by the three framework entry points; signatures match the same-name methods on [WorkingTreeManager](classes/WorkingTreeManager.md) (and the one `switchBranch` on [VersionManager](../rxdb-plugin-history/interfaces/VersionManager.md)). |
| [WorkingTreeCommitEvent](interfaces/WorkingTreeCommitEvent.md)                         | A commit that **actually wrote a new commit**, emitted by the facade's `commits$` after the transaction commits.                                                                                                                                                        |
| [WorkingTreeCredentials](interfaces/WorkingTreeCredentials.md)                         | The three positions captured by the caller on read (FR-020/FR-031).                                                                                                                                                                                                     |
| [WorkingTreeDiff](interfaces/WorkingTreeDiff.md)                                       | The complete answer of one `diff()` call (contracts/core-api.md §3).                                                                                                                                                                                                    |
| [WorkingTreeDiffEntry](interfaces/WorkingTreeDiffEntry.md)                             | How one uncommitted unit looks in a diff.                                                                                                                                                                                                                               |
| [WorkingTreeDiffOptions](interfaces/WorkingTreeDiffOptions.md)                         | Options for one `diff()` call (contracts/core-api.md §3).                                                                                                                                                                                                               |
| [WorkingTreeDiffTransaction](interfaces/WorkingTreeDiffTransaction.md)                 | A group of units at transaction granularity.                                                                                                                                                                                                                            |
| [WorkingTreeEmptyState](interfaces/WorkingTreeEmptyState.md)                           | The call succeeded, and the result is **semantically empty**.                                                                                                                                                                                                           |
| [WorkingTreeEntryKey](interfaces/WorkingTreeEntryKey.md)                               | The identity triple of a working tree unit, matching the part of the unique constraint except for `branch`.                                                                                                                                                             |
| [WorkingTreeEntryRow](interfaces/WorkingTreeEntryRow.md)                               | The row persisted after folding (the mutable part of `rxdb_working_tree_entry`)                                                                                                                                                                                         |
| [WorkingTreeErrorState](interfaces/WorkingTreeErrorState.md)                           | The call threw; the error is normalized to `Error` and the original instance is passed through as-is.                                                                                                                                                                   |
| [WorkingTreeIdleState](interfaces/WorkingTreeIdleState.md)                             | Nobody has initiated this call yet.                                                                                                                                                                                                                                     |
| [WorkingTreeLoadingState](interfaces/WorkingTreeLoadingState.md)                       | The call has been issued but has not landed yet.                                                                                                                                                                                                                        |
| [WorkingTreePatchCodecContext](interfaces/WorkingTreePatchCodecContext.md)             | The two metadata resolvers needed by the codec.                                                                                                                                                                                                                         |
| [WorkingTreePatchTarget](interfaces/WorkingTreePatchTarget.md)                         | The two columns used to locate the target entity on a working tree entry / commit change set row.                                                                                                                                                                       |
| [WorkingTreeRestoreEntityRef](interfaces/WorkingTreeRestoreEntityRef.md)               | A row's three-part identity: namespace, entity name, entity primary key.                                                                                                                                                                                                |
| [WorkingTreeRestoreSessionInfo](interfaces/WorkingTreeRestoreSessionInfo.md)           | The current branch's not-yet-finished restore session (contracts/core-api.md §5).                                                                                                                                                                                       |
| [WorkingTreeRestoreTarget](interfaces/WorkingTreeRestoreTarget.md)                     | The restore target: which commit to restore the working tree to, and which units of it.                                                                                                                                                                                 |
| [WorkingTreeRevisionSnapshot](interfaces/WorkingTreeRevisionSnapshot.md)               | Current values of the three positions read inside the command's own write transaction.                                                                                                                                                                                  |
| [WorkingTreeStatus](interfaces/WorkingTreeStatus.md)                                   | The complete answer of one `status()` call (contracts/core-api.md §3).                                                                                                                                                                                                  |
| [WorkingTreeSuccessState](interfaces/WorkingTreeSuccessState.md)                       | The call succeeded; `value` is its return value.                                                                                                                                                                                                                        |
| [WorkingTreeWritePrimitiveSignature](interfaces/WorkingTreeWritePrimitiveSignature.md) | The signature identity of a write primitive                                                                                                                                                                                                                             |
| [WorktreeAddOptions](interfaces/WorktreeAddOptions.md)                                 | Options for [WorktreeManager.add](classes/WorktreeManager.md#add).                                                                                                                                                                                                      |
| [WorktreeAsyncStates](interfaces/WorktreeAsyncStates.md)                               | Async state of each slot of the checkout entry point.                                                                                                                                                                                                                   |
| [WorktreeBranchTarget](interfaces/WorktreeBranchTarget.md)                             | Branch view: the complete data of the target branch at this moment, including its uncommitted changes.                                                                                                                                                                  |
| [WorktreeCommands](interfaces/WorktreeCommands.md)                                     | Checkout commands exposed by the three framework entry points; signatures match the same-name methods on [WorktreeManager](classes/WorktreeManager.md).                                                                                                                 |
| [WorktreeCommitTarget](interfaces/WorktreeCommitTarget.md)                             | Commit view: the tracked data of a reachable commit on the current active branch at the moment it completes.                                                                                                                                                            |
| [WorktreeCommitViewPlan](interfaces/WorktreeCommitViewPlan.md)                         | The path to walk backwards when the commit view can be opened.                                                                                                                                                                                                          |
| [WorktreeOpenOptions](interfaces/WorktreeOpenOptions.md)                               | Options for [WorktreeManager.open](classes/WorktreeManager.md#open).                                                                                                                                                                                                    |
| [WorktreeOptions](interfaces/WorktreeOptions.md)                                       | Options for a read-only checkout.                                                                                                                                                                                                                                       |
| [WorktreeView](interfaces/WorktreeView.md)                                             | An open read-only checkout.                                                                                                                                                                                                                                             |
| [WriteEntranceRequest](interfaces/WriteEntranceRequest.md)                             | A write handed to [classifyWriteEntrance](functions/classifyWriteEntrance.md)                                                                                                                                                                                           |

## Type Aliases

| Type Alias                                                                                         | Description                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BranchNotMaterializedReason](type-aliases/BranchNotMaterializedReason.md)                         | Why one materialization attempt was rejected; the caller uses it to decide whether to retry, re-pull, or give up.                                                |
| [BulkWriteOperation](type-aliases/BulkWriteOperation.md)                                           | The two adapter bulk write methods subject to the gate.                                                                                                          |
| [ColdReplayMismatch](type-aliases/ColdReplayMismatch.md)                                           | One difference between the replay result and the actual business table content.                                                                                  |
| [ColdReplaySnapshot](type-aliases/ColdReplaySnapshot.md)                                           | A set of business data rows                                                                                                                                      |
| [CommitChangeSetRow](type-aliases/CommitChangeSetRow.md)                                           | The nine columns of a `rxdb_commit_change_set` row that participate in restoration.                                                                              |
| [CommitChangeUnitOperation](type-aliases/CommitChangeUnitOperation.md)                             | The operation type of a change unit, same value domain as `CommitChangeSet.operation`.                                                                           |
| [CommitChangeUnitOrigin](type-aliases/CommitChangeUnitOrigin.md)                                   | The origin of a change unit, same value domain as `CommitChangeSet.origin`.                                                                                      |
| [CommitConflictKind](type-aliases/CommitConflictKind.md)                                           | The conflict kind corresponding to each of the three comparisons.                                                                                                |
| [CommitEncryptedAtRestReason](type-aliases/CommitEncryptedAtRestReason.md)                         | Why one at-rest check matched.                                                                                                                                   |
| [CommitEncryptedAtRestRecognizer](type-aliases/CommitEncryptedAtRestRecognizer.md)                 | Determines whether a value is already in its "encrypted at-rest form".                                                                                           |
| [CommitErrorCode](type-aliases/CommitErrorCode.md)                                                 | Value union of [CommitErrorCode](variables/CommitErrorCode.md)                                                                                                   |
| [CommitKind](type-aliases/CommitKind.md)                                                           | The kind of a commit node                                                                                                                                        |
| [CommitPatchColumn](type-aliases/CommitPatchColumn.md)                                             | The two columns that carry change content; both are equally authoritative: reverse data leakage and forward data leakage are the same thing.                     |
| [CommitResult](type-aliases/CommitResult.md)                                                       | The result of one `commit()` call.                                                                                                                               |
| [CommitValidationReason](type-aliases/CommitValidationReason.md)                                   | Why the commit was rejected; each corresponds to a hard constraint of FR-008 / FR-009.                                                                           |
| [FoldOutcome](type-aliases/FoldOutcome.md)                                                         | The conclusion of a fold; the three `kind`s correspond one-to-one with `entryCountDelta`, so callers do not need to count rows themselves.                       |
| [NoCaptureReason](type-aliases/NoCaptureReason.md)                                                 | Why the write was allowed but produced no unit; each corresponds to a different group of rows in the matrix.                                                     |
| [RawWriteAllowReason](type-aliases/RawWriteAllowReason.md)                                         | Why the write was allowed; each corresponds to one of the four steps.                                                                                            |
| [RawWriteJudgment](type-aliases/RawWriteJudgment.md)                                               | Which step the judgment landed on; step 3 is the only step that rejects.                                                                                         |
| [RestoreCompatibility](type-aliases/RestoreCompatibility.md)                                       | Preflight conclusion.                                                                                                                                            |
| [RestoreReplayDirection](type-aliases/RestoreReplayDirection.md)                                   | Replay direction.                                                                                                                                                |
| [VersionedEntityClass](type-aliases/VersionedEntityClass.md)                                       | The classification of an entity within the versioned domain                                                                                                      |
| [WorkingTreeBranchFromCommitCheck](type-aliases/WorkingTreeBranchFromCommitCheck.md)               | Result of [WorkingTreeManager.checkBranchFromCommit](classes/WorkingTreeManager.md#checkbranchfromcommit)                                                        |
| [WorkingTreeBranchFromCommitRejection](type-aliases/WorkingTreeBranchFromCommitRejection.md)       | Why a commit cannot be used to create a branch                                                                                                                   |
| [WorkingTreeCaptureMountPointOrdinal](type-aliases/WorkingTreeCaptureMountPointOrdinal.md)         | Row number in the contract §1 table, 1–4.                                                                                                                        |
| [WorkingTreeCommandState](type-aliases/WorkingTreeCommandState.md)                                 | Observable state of a command: **no empty** (§4).                                                                                                                |
| [WorkingTreeCreateBranchFromCommitResult](type-aliases/WorkingTreeCreateBranchFromCommitResult.md) | Result of [WorkingTreeManager.createBranchFromCommit](classes/WorkingTreeManager.md#createbranchfromcommit)                                                      |
| [WorkingTreeDiffGranularity](type-aliases/WorkingTreeDiffGranularity.md)                           | Flattening granularity: one row per unit, or grouped by transaction.                                                                                             |
| [WorkingTreeDiscardOptions](type-aliases/WorkingTreeDiscardOptions.md)                             | Input to one `discard()` call (contracts/core-api.md §3).                                                                                                        |
| [WorkingTreeDiscardResult](type-aliases/WorkingTreeDiscardResult.md)                               | The result of one `discard()` call.                                                                                                                              |
| [WorkingTreeEnableIfEmptyResult](type-aliases/WorkingTreeEnableIfEmptyResult.md)                   | The three outcomes of [WorkingTreeManager.enableIfEmpty](classes/WorkingTreeManager.md#enableifempty).                                                           |
| [WorkingTreeEntryOperation](type-aliases/WorkingTreeEntryOperation.md)                             | The net operation of a unit relative to HEAD.                                                                                                                    |
| [WorkingTreeOriginBreakdown](type-aliases/WorkingTreeOriginBreakdown.md)                           | Distribution of uncommitted entries by origin.                                                                                                                   |
| [WorkingTreePatch](type-aliases/WorkingTreePatch.md)                                               | Field-level patch; `null` means "no value on this side" (the inverse of insert, the forward of delete).                                                          |
| [WorkingTreeQueryState](type-aliases/WorkingTreeQueryState.md)                                     | Observable state of a query: **exactly one** empty more than a command (§4).                                                                                     |
| [WorkingTreeRestoreFailureReason](type-aliases/WorkingTreeRestoreFailureReason.md)                 | Why one `restore()` call was rejected.                                                                                                                           |
| [WorkingTreeRestoreOptions](type-aliases/WorkingTreeRestoreOptions.md)                             | Input to one `restore()` call: three captured positions, no fourth.                                                                                              |
| [WorkingTreeRestoreResult](type-aliases/WorkingTreeRestoreResult.md)                               | The result of one `restore()` call.                                                                                                                              |
| [WorkingTreeStatePatch](type-aliases/WorkingTreeStatePatch.md)                                     | Writes a new phase into one state slot.                                                                                                                          |
| [WorkingTreeStateSink](type-aliases/WorkingTreeStateSink.md)                                       | Where the state goes; each of the three frameworks wires it to its own reactive primitive.                                                                       |
| [WorkingTreeSwitchBranchOptions](type-aliases/WorkingTreeSwitchBranchOptions.md)                   | Optional second parameter of `switchBranch()` (FR-017, contracts/core-api.md §6).                                                                                |
| [WorktreeAdapterFactory](type-aliases/WorktreeAdapterFactory.md)                                   | Builds a local adapter for a snapshot instance: same shape as the `rxdb.adapter()` factory.                                                                      |
| [WorktreeKind](type-aliases/WorktreeKind.md)                                                       | Whether a checkout's HEAD is a branch or a commit.                                                                                                               |
| [WorktreeLockRelease](type-aliases/WorktreeLockRelease.md)                                         | Releases a checkout lock; settles only after the lock is actually returned; repeated calls have no effect.                                                       |
| [WorktreeMode](type-aliases/WorktreeMode.md)                                                       | Whether a checkout is writable.                                                                                                                                  |
| [WorktreeOwner](type-aliases/WorktreeOwner.md)                                                     | Who owns a checkout: a tab session (reclaimable when the session ends), or persistent (survives refresh).                                                        |
| [WorktreeState](type-aliases/WorktreeState.md)                                                     | Whether the snapshot database has finished being built.                                                                                                          |
| [WorktreeStatePatch](type-aliases/WorktreeStatePatch.md)                                           | Writes a new phase into one state slot.                                                                                                                          |
| [WorktreeTarget](type-aliases/WorktreeTarget.md)                                                   | The HEAD of a checkout.                                                                                                                                          |
| [WorktreeTransactionRunner](type-aliases/WorktreeTransactionRunner.md)                             | Managed transaction of the working tree facade: reads the capability bit, passes the gate, then hands the executor and this epoch's adapter to the command body. |
| [WorktreeUnavailableReason](type-aliases/WorktreeUnavailableReason.md)                             | Why the checkout could not be opened or renamed.                                                                                                                 |
| [WriteColumns](type-aliases/WriteColumns.md)                                                       | Which columns this write touched                                                                                                                                 |
| [WriteEntranceDecision](type-aliases/WriteEntranceDecision.md)                                     | Conclusion of [classifyWriteEntrance](functions/classifyWriteEntrance.md).                                                                                       |
| [WriteEntryOrigin](type-aliases/WriteEntryOrigin.md)                                               | The origin of a unit                                                                                                                                             |
| [WriteOperation](type-aliases/WriteOperation.md)                                                   | The operation kind of one write; only `update` may produce no net change.                                                                                        |
| [WriteTargetClass](type-aliases/WriteTargetClass.md)                                               | Value union of [WRITE\_TARGET\_CLASSES](variables/WRITE_TARGET_CLASSES.md)                                                                                       |

## Variables

| Variable                                                                                               | Description                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [COMMIT\_ERROR\_CODES](variables/COMMIT_ERROR_CODES.md)                                                | All commit error codes, in the same order as declared in [CommitErrorCode](variables/CommitErrorCode.md)        |
| [CommitErrorCode](variables/CommitErrorCode.md)                                                        | Stable error codes of the commit capability                                                                     |
| [rxDBPluginWorkingTree](variables/rxDBPluginWorkingTree.md)                                            | RxDB working tree plugin factory.                                                                               |
| [UNTRACKED\_BOOKKEEPING\_FIELDS](variables/UNTRACKED_BOOKKEEPING_FIELDS.md)                            | The second untracked category: bookkeeping fields on entity rows, exempt **globally**                           |
| [WORKING\_TREE\_CAPABILITY\_VERSION](variables/WORKING_TREE_CAPABILITY_VERSION.md)                     | The version number this capability writes into the watermark row                                                |
| [WORKING\_TREE\_CAPTURE\_MOUNT\_POINT\_METHODS](variables/WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS.md) | Names of the mounted write primitives, in contract §1 table order.                                              |
| [WORKING\_TREE\_CAPTURE\_MOUNT\_POINTS](variables/WORKING_TREE_CAPTURE_MOUNT_POINTS.md)                | The 4 mount points of contract §1, flattened into rows.                                                         |
| [WORKING\_TREE\_INITIAL\_ASYNC\_STATES](variables/WORKING_TREE_INITIAL_ASYNC_STATES.md)                | All fourteen start as "nobody asked yet"; this is the single initial value of the three framework entry points. |
| [WORKTREE\_INITIAL\_ASYNC\_STATES](variables/WORKTREE_INITIAL_ASYNC_STATES.md)                         | Initial phase of each slot: all `idle`.                                                                         |
| [WRITE\_TARGET\_CLASSES](variables/WRITE_TARGET_CLASSES.md)                                            | The table categories a write can target                                                                         |

## Functions

| Function                                                                                | Description                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [activationStateIdOf](functions/activationStateIdOf.md)                                 | Primary key of the activation state row of a table set: for the main checkout it is WORKING\_TREE\_ACTIVATION\_STATE\_ID, for a writable checkout its holding key (US-314 B2.2). |
| [allocateBranchGeneration](functions/allocateBranchGeneration.md)                       | Issues the next branch generation: has the database increment `branchGenerationSeq` in place, then reads the new value back.                                                     |
| [applyRawWriteJudgment](functions/applyRawWriteJudgment.md)                             | Judges, and executes the statement when allowed; implementation of the capture runtime's `gateRawWrite()`                                                                        |
| [assertColdReplayInvariant](functions/assertColdReplayInvariant.md)                     | Verifies the cold replay invariant                                                                                                                                               |
| [assertCommitUnitsEncryptedAtRest](functions/assertCommitUnitsEncryptedAtRest.md)       | Validates that the encrypted columns of a batch of change units are all in at-rest form (FR-038).                                                                                |
| [assertSwitchBranchPreconditions](functions/assertSwitchBranchPreconditions.md)         | Validates the preconditions **explicitly proposed** by the caller (FR-017, FR-020).                                                                                              |
| [assertSwitchTargetIntact](functions/assertSwitchTargetIntact.md)                       | Validates that the **target** branch's commit graph is reachable and intact (FR-051, SC-013).                                                                                    |
| [assertWorkingTreeEntryCountIntact](functions/assertWorkingTreeEntryCountIntact.md)     | Validates that the redundant column matches the actual entry row count (data-model.md §2.6).                                                                                     |
| [breaksReadOnly](functions/breaksReadOnly.md)                                           | Whether this batch of statements should be rejected on a read-only connection: statements that modify data, plus `PRAGMA` / `SET` / `set_config()` that modify session state.    |
| [buildVersionedDomain](functions/buildVersionedDomain.md)                               | Computes the versioned domain from the entity registrations                                                                                                                      |
| [captureChanges](functions/captureChanges.md)                                           | Captures a batch of change log entries into working tree units (**the whole batch shares one `unitId`**)                                                                         |
| [captureCrudWrite](functions/captureCrudWrite.md)                                       | Wraps one ordinary CRUD write into the four steps of working tree capture (FR-039)                                                                                               |
| [checkRestoreCompatibility](functions/checkRestoreCompatibility.md)                     | Determines whether "restoring the working tree to the target commit" is feasible in the current client.                                                                          |
| [classifyWriteEntrance](functions/classifyWriteEntrance.md)                             | Determines whether a write should become a working tree unit                                                                                                                     |
| [commitWorkingTree](functions/commitWorkingTree.md)                                     | Commits all uncommitted units in the current branch's working tree (FR-041).                                                                                                     |
| [createWorkingTreeActivationRow](functions/createWorkingTreeActivationRow.md)           | Builds the initial activation state row (not yet persisted).                                                                                                                     |
| [createWorkingTreeCaptureBatch](functions/createWorkingTreeCaptureBatch.md)             | Builds the capture context shared by one batch of changes                                                                                                                        |
| [createWorkingTreeCapturePort](functions/createWorkingTreeCapturePort.md)               | Wraps a transaction executor into a [WorkingTreeCapturePort](interfaces/WorkingTreeCapturePort.md) with a **single identity**                                                    |
| [createWorkingTreeCaptureRuntime](functions/createWorkingTreeCaptureRuntime.md)         | Builds the capture runtime from a database's entity registrations                                                                                                                |
| [createWorkingTreeCommands](functions/createWorkingTreeCommands.md)                     | Wires the fourteen commands to the state slots.                                                                                                                                  |
| [createWorkingTreeCommitsInitialRows](functions/createWorkingTreeCommitsInitialRows.md) | Builds all initial rows of the epic-006 persistence layer (§8 steps 2–3)                                                                                                         |
| [createWorktreeCommands](functions/createWorktreeCommands.md)                           | Builds a set of checkout commands.                                                                                                                                               |
| [decodeCommitChangeSetUnit](functions/decodeCommitChangeSetUnit.md)                     | Restores one `rxdb_commit_change_set` row into change unit content.                                                                                                              |
| [decodeCommitChangeSetUnits](functions/decodeCommitChangeSetUnits.md)                   | Batch version of [decodeCommitChangeSetUnit](functions/decodeCommitChangeSetUnit.md), **preserving input order**.                                                                |
| [decodeWorkingTreePatch](functions/decodeWorkingTreePatch.md)                           | Inverse of [encodeWorkingTreePatch](functions/encodeWorkingTreePatch.md).                                                                                                        |
| [diffColdReplay](functions/diffColdReplay.md)                                           | Compares the replay result with the actual business table content                                                                                                                |
| [discardWorkingTree](functions/discardWorkingTree.md)                                   | Reverts the current branch's entire working tree back to the current HEAD (FR-016).                                                                                              |
| [encodeWorkingTreePatch](functions/encodeWorkingTreePatch.md)                           | Encodes a patch into the form that can be stored in the `patch` / `inversePatch` json columns.                                                                                   |
| [findCommitConflict](functions/findCommitConflict.md)                                   | Compares the three captured positions and produces the first mismatch (FR-031).                                                                                                  |
| [findFirstReplayIncompatibility](functions/findFirstReplayIncompatibility.md)           | Finds the first incompatible node along a **chosen** path.                                                                                                                       |
| [fingerprintOf](functions/fingerprintOf.md)                                             | Fingerprint of a unit's current state (FNV-1a/32, fixed-length 8 hex digits).                                                                                                    |
| [foldWorkingTreeEntry](functions/foldWorkingTreeEntry.md)                               | Folds one capture into the existing working tree unit                                                                                                                            |
| [gateBulkWrite](functions/gateBulkWrite.md)                                             | Judges one bulk write; only calls the write primitive factory when allowed                                                                                                       |
| [gateExternalNotify](functions/gateExternalNotify.md)                                   | Judges one external update notification; only executes the notification body when allowed                                                                                        |
| [isCommitChangeSetPageEmpty](functions/isCommitChangeSetPageEmpty.md)                   | Empty of `commitChanges()`: this commit has no change units (baseline nodes are like this).                                                                                      |
| [isCommitErrorCode](functions/isCommitErrorCode.md)                                     | Determines whether a value is a registered commit error code                                                                                                                     |
| [isCommitLogPageEmpty](functions/isCommitLogPageEmpty.md)                               | Empty of `listCommits()`: this branch has no history yet.                                                                                                                        |
| [isWorkingTreeCaptureMountPoint](functions/isWorkingTreeCaptureMountPoint.md)           | -                                                                                                                                                                                |
| [isWorkingTreeDiffEmpty](functions/isWorkingTreeDiffEmpty.md)                           | Empty of `diff()`: this page has nothing to show.                                                                                                                                |
| [isWorkingTreeRestoreSessionEmpty](functions/isWorkingTreeRestoreSessionEmpty.md)       | Empty of `restoreSession()`: the current branch has no unfinished restore session.                                                                                               |
| [isWorkingTreeStatusEmpty](functions/isWorkingTreeStatusEmpty.md)                       | Empty of `status()`: no uncommitted changes.                                                                                                                                     |
| [isWorktreeCommitTarget](functions/isWorktreeCommitTarget.md)                           | Whether this is a commit view.                                                                                                                                                   |
| [judgeRawWrite](functions/judgeRawWrite.md)                                             | Determines whether one raw call should be issued                                                                                                                                 |
| [producesWorkingTreeEntry](functions/producesWorkingTreeEntry.md)                       | Will this trusted path produce a working tree unit?                                                                                                                              |
| [readActiveBranchToken](functions/readActiveBranchToken.md)                             | Reads this instance's current branch token: the branch held by the mounted table set                                                                                             |
| [readActiveRestoreSession](functions/readActiveRestoreSession.md)                       | Reads the current branch's unfinished restore session; `null` when there is none.                                                                                                |
| [readBranchEntries](functions/readBranchEntries.md)                                     | Reads all current uncommitted entries of a branch, ascending by `id`                                                                                                             |
| [readCommitChangeSetPage](functions/readCommitChangeSetPage.md)                         | Reads all change units of one commit.                                                                                                                                            |
| [readCommitLogPage](functions/readCommitLogPage.md)                                     | Reads one branch's commit history, translated into a public-facing page.                                                                                                         |
| [readMountedWorktreeTableSet](functions/readMountedWorktreeTableSet.md)                 | The table set this instance currently has mounted: the set `worktreeTableSet$` hands out at subscription time (US-314 C1).                                                       |
| [readWorkingTreeActivationState](functions/readWorkingTreeActivationState.md)           | Reads the activation state: `activationRevision` from the row of the table set this instance mounts, `branchGenerationSeq` from the main checkout's row.                         |
| [readWorkingTreeDiff](functions/readWorkingTreeDiff.md)                                 | Flattens a branch's `HEAD ↔ working tree` difference (FR-005).                                                                                                                   |
| [readWorkingTreeStateRow](functions/readWorkingTreeStateRow.md)                         | Gets this branch's working tree state row.                                                                                                                                       |
| [readWorkingTreeStatus](functions/readWorkingTreeStatus.md)                             | Reads the current branch's working tree summary (FR-004).                                                                                                                        |
| [replayWorkingTree](functions/replayWorkingTree.md)                                     | Replays the net state using `HEAD projection + all working tree units`                                                                                                           |
| [restoreWorkingTree](functions/restoreWorkingTree.md)                                   | Writes the target commit's contents back into the current working tree as new uncommitted changes (FR-013).                                                                      |
| [selectRestoreReplayPath](functions/selectRestoreReplayPath.md)                         | Chooses the deterministic path to walk back for "restore to the target node".                                                                                                    |
| [toCapturedWrite](functions/toCapturedWrite.md)                                         | Folds one change log entry into a write pending capture                                                                                                                          |
| [trackWorkingTreeCommand](functions/trackWorkingTreeCommand.md)                         | Runs a command, emitting loading → success \| error along the way.                                                                                                               |
| [trackWorkingTreeQuery](functions/trackWorkingTreeQuery.md)                             | Runs a query, emitting loading → success \| empty \| error along the way.                                                                                                        |

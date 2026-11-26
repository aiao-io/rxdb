# rxdb-plugin-working-tree

RxDB local working tree and commit history plugin: introduces "uncommitted changes" and "commit history" as first-class concepts in `@aiao/rxdb`.

Libraries without this package installed pay **zero cost** — all eleven system tables, write capture, and commit graph codecs ship with the package; the core only keeps the install/uninstall hook and two hand-off gates.

## Capability scope

- Write capture: user edits land in the working tree instead of mutating the primary data directly; the database's own bookkeeping writes are not captured
- `status()` / `diff()`: read the current branch's uncommitted summary and per-entry changes
- `commit()`: commits **all** uncommitted units in the working tree into one snapshot; CAS failures are reported via the return value rather than exceptions
- `discard()`: reverts the entire working tree back to HEAD
- `listCommits()`: read the current branch's reachable commit history
- `restore()` / `restoreSession()`: write the contents of a reachable historical commit back into the working tree as **new uncommitted changes**; HEAD is not moved, history is not deleted, and the four rejection causes are reported via the return value
- `switchBranch()`'s two optional preconditions (`requireClean` / `expectedActivationRevision`); mounted on `db.versionManager` from `@aiao/rxdb-plugin-history`, rejections **throw**
- `checkouts`: worktrees. A read-only worktree does not switch branches or touch the working tree — it builds a read-only snapshot from the complete data of another branch or a reachable commit on the current branch, browsed through a second read-only instance; the snapshot database comes from the plugin option `worktrees.adapter`, the same backend as the main database but with its own database name (six backends: PGlite and the SQLite family).
  A writable worktree (`add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()`) is a set of shadow tables in the same database; the main instance mounts it to read, write, commit, switch branches, and merge, while the main checkout stays untouched; a branch can be held by only one worktree, and instances mounted on a writable worktree do not sync

## Six things to know before using it

See the [plugin page](https://rxdb.aiao.io/docs/plugins/rxdb-plugin-working-tree) on the docs site for the full version; this is the condensed one:

1. **The commit capability is an explicit database-level switch** — call `enable()` once and every entity and every branch in the database runs under working-tree semantics. Enabling leaves a capability watermark row behind, and **clients without this package installed will refuse to connect to the database from then on**; v1 has no `disable()`.
2. **The working tree is not a draft cache.** The working tree holds changes that have already been written to the database but not yet committed as a snapshot — they take part in transactions and are visible to queries. The draft cache (`@aiao/rxdb-plugin-workspace`) holds editor buffers that have not been saved yet and never entered the main database. The two layers cannot be merged, which is why this package does not take the `Workspace*` prefix.
3. **`restore()` is not a checkout.** It writes historical contents back into the working tree as new uncommitted changes: HEAD does not move, history is not deleted, the working tree becomes dirty, and the next step is `commit()` or `discard()`. v1 has no detached HEAD and no `checkout()`.
4. **History keeps sensitive old values verbatim.** A field that was once written into a commit stays in that commit's `ChangeSet` forever; later edits, clears, or row deletions do not touch it. v1 has no public API to scrub it out of history. **Do not write anything that should not leave a trace into a database with the commit capability enabled.**
5. **Encryption boundary**: encrypted fields are still persisted as versioned envelopes in commits, the working tree, and restore sessions; the persistence path never decrypts first and then writes plaintext, and errors and summaries never carry plaintext. But encryption protects the **bytes on disk** — it does not cancel out item 4, and item 4 cannot replace it.
6. **History is never rewritten**: no amend / rebase / squash, no "edit commit message", and no auto-baseline. When the commit graph is corrupted, the guard only sets `corrupted_read_only` and leaves diagnostics behind — **HEAD is not moved and records are not deleted**.

One more thing that is often missed: **changes pulled down by remote sync enter the working tree just like user edits** — they are counted as `origin = 'remote_sync'` in `status().byOrigin`, are **not exempt**, turn `clean` into `false`, and are committed along with everything else by the next `commit()` (the author is that `commit()` call's `authorId`; v1 does not fabricate a remote author). "The working tree suddenly went dirty after a sync" is expected behavior.

Only four categories are excluded from version control: entities of `SyncType.QueryCache`; the `remoteId` and audit timestamps on entity rows; derived index columns registered by plugins; and entities with change logging disabled (`@Entity({ log: false })`), such as the storage plugin's file metadata. Their changes never appear in `status()` / `diff()` / `commit()`, and `restore()` will not bring them back.

## Capability boundary: writes that bypass the adapter cannot be stopped

Write capture only covers **write paths that go through the adapter and the batch write methods the adapter exposes**. Opening the same SQLite file directly, spinning up a second PGlite instance, hand-writing SQL in DevTools — none of these can be stopped, **v1 does not promise to stop them**, and they do not enter the working tree, do not enter history, and are invisible to `status()`.

So a database with the commit capability enabled has one hard constraint: **business tables may only be written through RxDB**. Writing this down is not a disclaimer footnote — being honest about what cannot be stopped matters more than stopping it: a gate that claims to stop writes but does not will make people read "no error" as "not bypassed".

## Usage

```ts
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← must come before connect()
await db.connect('sqlite-wasm');

await db.workingTree.enable(); // A migration on an existing database, an idempotent confirmation on a new one

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
  // Someone else committed first: conflict carries the new revision; re-read status and retry
  console.warn(result.conflict);
}
```

**`use()` must come before `connect()`.** This plugin declares `system` (`RxDBSystemContribution`);
the host must read its entities, initial rows, and migrations before creating tables. Calling `use()`
after `connect()` is already too late for table creation, and the core throws immediately instead of
silently skipping.

The two `switchBranch()` preconditions are not on this package's entry point: `db.versionManager` is mounted by
[`@aiao/rxdb-plugin-history`](../rxdb-plugin-history/README.md) within the connection epoch; the core does not create it automatically.
You do not need it if you only use the working tree and commits; if you want `switchBranch()`, `use()` it alongside,
otherwise `db.versionManager` is `undefined` — the core does no fallback.

```ts
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

db.use(rxDBPluginWorkingTree);
db.use(rxDBPluginHistory);
```

`db.workingTree` is a **non-optional** member, added via `declare module '@aiao/rxdb'`: this entry point exists only
when the package is installed; without it, `db.workingTree` is a compile error rather than a runtime `undefined`.
It is still present when the capability is not enabled, but every method rejects with `commit_capability_disabled`.

## Unclaimed capability guard

A database that has been through `enable()` leaves a capability watermark row in `rxdb_migration`
(`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`).
**When a client without this package opens the database again, the core refuses the connection**
and reports the exact package name to install:

```
This database has an RxDB capability enabled that this process has not claimed; without the corresponding plugin, writes are not governed by that capability, so the connection is refused:
  - workingTree v1 — install @aiao/rxdb-plugin-working-tree
```

This guard is the key benefit of extracting this package out of the core: it replaces the old approach of bumping
`RXDB_SYSTEM_SCHEMA_VERSION` to lock out old clients, and it **works for third-party plugins too** —
the package name is written into the watermark row by the plugin itself, so the core does not need to know it.

## System tables

Eleven tables, in creation order:

`CommitCapabilityState`, `WorkingTreeActivationState`, `Commit`, `CommitChangeSet`, `CommitBranchRef`,
`WorkingTreeState`, `WorkingTreeEntry`, `WorkingTreeRestoreSession`, `WorkingTreeMaterializationStage`,
`WorkingTreeMaterializationPage`, `Worktree` (the worktree registration table, shared by read-only and writable worktrees).

They enter the core's system table identity set via `registerSystemEntities()`, so `isSystemEntity()` recognizes them —
cross-package consumers such as `@aiao/rxdb-adapter-http` will not push them to the remote as integration-side data.

## Framework bindings

- Angular — [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular/README.md)
- React — [`@aiao/rxdb-plugin-working-tree-react`](../rxdb-plugin-working-tree-react/README.md)
- Vue — [`@aiao/rxdb-plugin-working-tree-vue`](../rxdb-plugin-working-tree-vue/README.md)

The three frameworks' `useWorkingTree()` and the read-only worktrees' `useWorktrees()` share the same names and semantics; only the state container shapes differ (`Signal` / render snapshot / `ComputedRef`).

## Conformance suites

`@aiao/rxdb-plugin-working-tree/testing` exports cross-backend conformance suites (capture + commit + worktree);
the six adapter packages (electron / sqlite / sqlite-wasm / pglite / sqliteai / wa-sqlite) each run all three.

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

| Class | Description |
| ------ | ------ |
| [BranchNotMaterializedError](classes/BranchNotMaterializedError.md) | Insufficient materialization basis; the whole attempt rolls back entirely with `branch_not_materialized` (FR-044). |
| [ColdReplayMismatchError](classes/ColdReplayMismatchError.md) | The cold replay invariant is broken. |
| [CommitEncryptedAtRestError](classes/CommitEncryptedAtRestError.md) | An encrypted column's value did not enter the commit in its at-rest form (FR-038). |
| [CommitValidationError](classes/CommitValidationError.md) | Arguments failed validation; thrown **before any read or write**. |
| [MixedVersionedCacheTransactionError](classes/MixedVersionedCacheTransactionError.md) | QueryCache entities and other entities were mixed into the same transaction unit |
| [RxDBPluginWorkingTree](classes/RxDBPluginWorkingTree.md) | The plugin lifecycle object that installs the working tree and commit history onto a single RxDB instance. |
| [StaleActiveBranchError](classes/StaleActiveBranchError.md) | The caller's active branch token has expired |
| [UnknownWorkingTreePatchEntityError](classes/UnknownWorkingTreePatchEntityError.md) | Error thrown by the encoding side when the target entity is not registered in this process. |
| [WorkingTreeCapabilityDisabledError](classes/WorkingTreeCapabilityDisabledError.md) | A managed member was called on a database without the commit capability enabled. |
| [WorkingTreeCaptureRuntime](classes/WorkingTreeCaptureRuntime.md) | The capture runtime |
| [WorkingTreeDirtyError](classes/WorkingTreeDirtyError.md) | The switch was rejected because the working tree is not empty (FR-017). |
| [WorkingTreeEntryCountMismatchError](classes/WorkingTreeEntryCountMismatchError.md) | The redundant column does not match the actual entry row count. |
| [WorkingTreeManager](classes/WorkingTreeManager.md) | The entry point for the working tree and commit history (see contracts/core-api.md §1). |
| [WorkingTreeReplayCorruptionError](classes/WorkingTreeReplayCorruptionError.md) | A working tree unit violated a folding invariant |
| [WorkingTreeWriteRejectedError](classes/WorkingTreeWriteRejectedError.md) | A write rejected by the gate |
| [Worktree](classes/Worktree.md) | A worktree's registration row. |
| [WorktreeManager](classes/WorktreeManager.md) | The worktree entry point: `rxdb.workingTree.checkouts`. |
| [WorktreeUnavailableError](classes/WorktreeUnavailableError.md) | A worktree cannot be opened, or cannot be renamed. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ActiveBranchToken](interfaces/ActiveBranchToken.md) | The active branch identity captured by the caller **when reading / instantiating entities** (FR-020) |
| [BulkWriteGateRequest](interfaces/BulkWriteGateRequest.md) | The judgment input for a batch write |
| [CapturedWrite](interfaces/CapturedWrite.md) | A captured write |
| [ChangeCaptureSource](interfaces/ChangeCaptureSource.md) | The `rxdb_change` columns capture needs |
| [ColdReplayIdentity](interfaces/ColdReplayIdentity.md) | The identity of a business data row, matching the working tree unit's unique index except for `branchId`. |
| [ColdReplayInvariantInput](interfaces/ColdReplayInvariantInput.md) | The argument of [assertColdReplayInvariant](functions/assertColdReplayInvariant.md). |
| [ColdReplayRow](interfaces/ColdReplayRow.md) | A row of business data: identity + all column values. |
| [CommitCapabilityInfo](interfaces/CommitCapabilityInfo.md) | A read-only view of that capability state row in the database. |
| [CommitCapabilityVersions](interfaces/CommitCapabilityVersions.md) | The three capability version numbers supported by this process. |
| [CommitChangeSetPage](interfaces/CommitChangeSetPage.md) | The page returned by commitChanges: all change units of one commit, in write order. |
| [CommitChangeUnitContent](interfaces/CommitChangeUnitContent.md) | The part of a unit's content that enters the digest — exactly the nine columns persisted by `CommitChangeSet`. |
| [CommitConflict](interfaces/CommitConflict.md) | The typed diagnosis given by a rejected commit / discard (contracts/core-api.md §4.1). |
| [CommitLogEntry](interfaces/CommitLogEntry.md) | One commit node in the history. |
| [CommitLogOptions](interfaces/CommitLogOptions.md) | The arguments of a `listCommits()` call (contracts/core-api.md §5). |
| [CommitLogPage](interfaces/CommitLogPage.md) | The result of a `listCommits()` call. |
| [CommitOptions](interfaces/CommitOptions.md) | The arguments of a `commit()` call (contracts/core-api.md §4). |
| [CommitPatchCodecContext](interfaces/CommitPatchCodecContext.md) | The context needed for commit-side patch encoding/decoding and at-rest validation. |
| [ExpectedActiveBranch](interfaces/ExpectedActiveBranch.md) | The active branch assertion **proposed** by the caller (the type of [StaleActiveBranchError.expected](classes/StaleActiveBranchError.md#expected)) |
| [ExternalNotifyGateRequest](interfaces/ExternalNotifyGateRequest.md) | The judgment input for an external update notification |
| [RawWriteJudgmentContext](interfaces/RawWriteJudgmentContext.md) | The judgment context for a raw call |
| [RestoreIncompatibility](interfaces/RestoreIncompatibility.md) | The stable description of the first incompatible node (FR-050). |
| [RestoreVersionManifest](interfaces/RestoreVersionManifest.md) | The version manifest: the two values users compare against "what do I have here". |
| [RxDBPluginWorkingTreeOptions](interfaces/RxDBPluginWorkingTreeOptions.md) | The options of [rxDBPluginWorkingTree](variables/rxDBPluginWorkingTree.md). |
| [VersionedDomain](interfaces/VersionedDomain.md) | The full view of the versioned domain: the table / column plane (inherited from [VersionedDomainView](interfaces/VersionedDomainView.md)) plus the entity plane |
| [VersionedDomainEntityInput](interfaces/VersionedDomainEntityInput.md) | A single entity registration needed to build the versioned domain |
| [VersionedDomainView](interfaces/VersionedDomainView.md) | The projection of the versioned domain onto the **table / column** plane — the port consumed by raw write judgment |
| [VersionedTransactionGuard](interfaces/VersionedTransactionGuard.md) | The guard against mixing QueryCache / other entities within one transaction unit |
| [WorkingTreeActivationInfo](interfaces/WorkingTreeActivationInfo.md) | A read-only view of the activation state row. |
| [WorkingTreeAsyncStates](interfaces/WorkingTreeAsyncStates.md) | All the state held by the three framework entries, one field per capability. |
| [WorkingTreeCaptureBatch](interfaces/WorkingTreeCaptureBatch.md) | The capture context shared by a batch of changes |
| [WorkingTreeCaptureHost](interfaces/WorkingTreeCaptureHost.md) | The host capabilities [createWorkingTreeCapturePort](functions/createWorkingTreeCapturePort.md) needs. |
| [WorkingTreeCaptureMountPoint](interfaces/WorkingTreeCaptureMountPoint.md) | A write primitive that must have working tree capture mounted on it. |
| [WorkingTreeCapturePort](interfaces/WorkingTreeCapturePort.md) | The persistence operations capture needs |
| [WorkingTreeCaptureRuntimeOptions](interfaces/WorkingTreeCaptureRuntimeOptions.md) | The host capabilities needed to construct the capture runtime. |
| [WorkingTreeCommands](interfaces/WorkingTreeCommands.md) | The fourteen commands exposed by the three framework entries; signatures match the methods of the same names on [WorkingTreeManager](classes/WorkingTreeManager.md) (and the `switchBranch` one on [VersionManager](../rxdb-plugin-history/interfaces/VersionManager.md)). |
| [WorkingTreeCommitEvent](interfaces/WorkingTreeCommitEvent.md) | A commit that **actually wrote a new commit**, emitted by the facade's `commits$` after the transaction commits. |
| [WorkingTreeCredentials](interfaces/WorkingTreeCredentials.md) | The three slots captured by the caller when reading (FR-020/FR-031). |
| [WorkingTreeDiff](interfaces/WorkingTreeDiff.md) | The complete answer of a `diff()` call (contracts/core-api.md §3). |
| [WorkingTreeDiffEntry](interfaces/WorkingTreeDiffEntry.md) | What an uncommitted unit looks like in a diff. |
| [WorkingTreeDiffOptions](interfaces/WorkingTreeDiffOptions.md) | The optional arguments of a `diff()` call (contracts/core-api.md §3). |
| [WorkingTreeDiffTransaction](interfaces/WorkingTreeDiffTransaction.md) | A group of units at transaction granularity. |
| [WorkingTreeEmptyState](interfaces/WorkingTreeEmptyState.md) | The call succeeded and the result is **semantically empty**. |
| [WorkingTreeEntryKey](interfaces/WorkingTreeEntryKey.md) | The identity triple of a working tree unit, matching the unique constraint minus the `branch` part. |
| [WorkingTreeEntryRow](interfaces/WorkingTreeEntryRow.md) | The row persisted after folding (the mutable part of `rxdb_working_tree_entry`) |
| [WorkingTreeErrorState](interfaces/WorkingTreeErrorState.md) | The call threw; the error is normalized to `Error`, and the original instance is passed through unchanged. |
| [WorkingTreeIdleState](interfaces/WorkingTreeIdleState.md) | Nobody has started this call yet. |
| [WorkingTreeLoadingState](interfaces/WorkingTreeLoadingState.md) | The call has been issued but has not landed yet. |
| [WorkingTreePatchCodecContext](interfaces/WorkingTreePatchCodecContext.md) | The two metadata resolvers needed for encoding/decoding. |
| [WorkingTreePatchTarget](interfaces/WorkingTreePatchTarget.md) | The two columns on a working tree entry / commit change set row used to locate the target entity. |
| [WorkingTreeRestoreEntityRef](interfaces/WorkingTreeRestoreEntityRef.md) | The three-part identity of a row: namespace, entity name, entity primary key. |
| [WorkingTreeRestoreSessionInfo](interfaces/WorkingTreeRestoreSessionInfo.md) | The current branch's restore session that has not ended yet (contracts/core-api.md §5). |
| [WorkingTreeRestoreTarget](interfaces/WorkingTreeRestoreTarget.md) | The restore target: which commit to restore the working tree to, and which of its units. |
| [WorkingTreeRevisionSnapshot](interfaces/WorkingTreeRevisionSnapshot.md) | The current values of the three slots as read by the command inside its own write transaction. |
| [WorkingTreeStatus](interfaces/WorkingTreeStatus.md) | The complete answer of a `status()` call (contracts/core-api.md §3). |
| [WorkingTreeSuccessState](interfaces/WorkingTreeSuccessState.md) | The call succeeded; `value` is its return value. |
| [WorkingTreeWritePrimitiveSignature](interfaces/WorkingTreeWritePrimitiveSignature.md) | The signature identity of a write primitive |
| [WorktreeAddOptions](interfaces/WorktreeAddOptions.md) | The options of [WorktreeManager.add](classes/WorktreeManager.md#add). |
| [WorktreeAsyncStates](interfaces/WorktreeAsyncStates.md) | The per-slot async states of the worktree entry. |
| [WorktreeBranchTarget](interfaces/WorktreeBranchTarget.md) | Branch view: the target branch's complete data at this moment, including its uncommitted changes. |
| [WorktreeCommands](interfaces/WorktreeCommands.md) | The worktree commands exposed by the three framework entries; signatures match the methods of the same names on [WorktreeManager](classes/WorktreeManager.md). |
| [WorktreeCommitTarget](interfaces/WorktreeCommitTarget.md) | Commit view: the tracked data of a reachable commit on the current active branch as of its completion. |
| [WorktreeCommitViewPlan](interfaces/WorktreeCommitViewPlan.md) | The path to walk back when the commit view can be opened. |
| [WorktreeOpenOptions](interfaces/WorktreeOpenOptions.md) | The options of [WorktreeManager.open](classes/WorktreeManager.md#open). |
| [WorktreeOptions](interfaces/WorktreeOptions.md) | The options of a read-only worktree. |
| [WorktreeView](interfaces/WorktreeView.md) | An open read-only worktree. |
| [WriteEntranceRequest](interfaces/WriteEntranceRequest.md) | A write handed to [classifyWriteEntrance](functions/classifyWriteEntrance.md) |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [BranchNotMaterializedReason](type-aliases/BranchNotMaterializedReason.md) | The cause of a rejected materialization; the caller decides based on it whether to retry, pull again, or give up. |
| [BulkWriteOperation](type-aliases/BulkWriteOperation.md) | The two public batch write methods of the adapter that are subject to the gate. |
| [ColdReplayMismatch](type-aliases/ColdReplayMismatch.md) | One difference between the replay result and the actual contents of the business tables. |
| [ColdReplaySnapshot](type-aliases/ColdReplaySnapshot.md) | A group of business data rows |
| [CommitChangeSetRow](type-aliases/CommitChangeSetRow.md) | The nine columns of a `rxdb_commit_change_set` row that take part in restoration. |
| [CommitChangeUnitOperation](type-aliases/CommitChangeUnitOperation.md) | A change unit's operation type, sharing the same value domain as `CommitChangeSet.operation`. |
| [CommitChangeUnitOrigin](type-aliases/CommitChangeUnitOrigin.md) | A change unit's origin, sharing the same value domain as `CommitChangeSet.origin`. |
| [CommitConflictKind](type-aliases/CommitConflictKind.md) | The conflict kinds corresponding to the three comparisons. |
| [CommitEncryptedAtRestReason](type-aliases/CommitEncryptedAtRestReason.md) | The cause of an at-rest hit. |
| [CommitEncryptedAtRestRecognizer](type-aliases/CommitEncryptedAtRestRecognizer.md) | Judges whether a value is already in its "encrypted at-rest form". |
| [CommitErrorCode](type-aliases/CommitErrorCode.md) | The value union of [CommitErrorCode](variables/CommitErrorCode.md) |
| [CommitKind](type-aliases/CommitKind.md) | The kind of a commit node |
| [CommitPatchColumn](type-aliases/CommitPatchColumn.md) | The two columns that carry change content, both equal: leaking data in reverse and leaking data forward are the same thing. |
| [CommitResult](type-aliases/CommitResult.md) | The result of a `commit()` call. |
| [CommitValidationReason](type-aliases/CommitValidationReason.md) | The reasons a commit was rejected; each corresponds to one hard constraint of FR-008 / FR-009. |
| [FoldOutcome](type-aliases/FoldOutcome.md) | The outcome of folding; the three `kind`s correspond one-to-one with `entryCountDelta`, so callers do not need to count rows themselves. |
| [NoCaptureReason](type-aliases/NoCaptureReason.md) | The reasons for allowing a write through without producing a unit; each corresponds to a different group of rows in the matrix. |
| [RawWriteAllowReason](type-aliases/RawWriteAllowReason.md) | The reasons for allowing; each corresponds to one of the four steps. |
| [RawWriteJudgment](type-aliases/RawWriteJudgment.md) | Which step the judgment landed on; step 3 is the only step that rejects. |
| [RestoreCompatibility](type-aliases/RestoreCompatibility.md) | The preflight conclusion. |
| [RestoreReplayDirection](type-aliases/RestoreReplayDirection.md) | The replay direction. |
| [VersionedEntityClass](type-aliases/VersionedEntityClass.md) | The classification of an entity within the versioned domain |
| [WorkingTreeBranchFromCommitCheck](type-aliases/WorkingTreeBranchFromCommitCheck.md) | The result of [WorkingTreeManager.checkBranchFromCommit](classes/WorkingTreeManager.md#checkbranchfromcommit) |
| [WorkingTreeBranchFromCommitRejection](type-aliases/WorkingTreeBranchFromCommitRejection.md) | The cause of a commit not being usable to create a branch |
| [WorkingTreeCaptureMountPointOrdinal](type-aliases/WorkingTreeCaptureMountPointOrdinal.md) | The row number in the contract §1 table, 1–4. |
| [WorkingTreeCommandState](type-aliases/WorkingTreeCommandState.md) | The observable state of a command: **no empty** (§4). |
| [WorkingTreeCreateBranchFromCommitResult](type-aliases/WorkingTreeCreateBranchFromCommitResult.md) | The result of [WorkingTreeManager.createBranchFromCommit](classes/WorkingTreeManager.md#createbranchfromcommit) |
| [WorkingTreeDiffGranularity](type-aliases/WorkingTreeDiffGranularity.md) | The unfolding granularity: one row per unit, or grouped by transaction. |
| [WorkingTreeDiscardOptions](type-aliases/WorkingTreeDiscardOptions.md) | The arguments of a `discard()` call (contracts/core-api.md §3). |
| [WorkingTreeDiscardResult](type-aliases/WorkingTreeDiscardResult.md) | The result of a `discard()` call. |
| [WorkingTreeEnableIfEmptyResult](type-aliases/WorkingTreeEnableIfEmptyResult.md) | The three outcomes of [WorkingTreeManager.enableIfEmpty](classes/WorkingTreeManager.md#enableifempty). |
| [WorkingTreeEntryOperation](type-aliases/WorkingTreeEntryOperation.md) | A unit's net operation relative to HEAD. |
| [WorkingTreeOriginBreakdown](type-aliases/WorkingTreeOriginBreakdown.md) | The distribution of uncommitted entries by origin. |
| [WorkingTreePatch](type-aliases/WorkingTreePatch.md) | A field-level patch; `null` means "no value on this side" (the inverse of insert, the forward of delete). |
| [WorkingTreeQueryState](type-aliases/WorkingTreeQueryState.md) | The observable state of a query: **exactly one more** empty than commands (§4). |
| [WorkingTreeRestoreFailureReason](type-aliases/WorkingTreeRestoreFailureReason.md) | The cause of a rejected `restore()` call. |
| [WorkingTreeRestoreOptions](type-aliases/WorkingTreeRestoreOptions.md) | The arguments of a `restore()` call: three captured slots, no fourth. |
| [WorkingTreeRestoreResult](type-aliases/WorkingTreeRestoreResult.md) | The result of a `restore()` call. |
| [WorkingTreeStatePatch](type-aliases/WorkingTreeStatePatch.md) | Writing a new phase into a state slot. |
| [WorkingTreeStateSink](type-aliases/WorkingTreeStateSink.md) | Where state goes; each of the three frameworks wires it to its own reactive primitives. |
| [WorkingTreeSwitchBranchOptions](type-aliases/WorkingTreeSwitchBranchOptions.md) | The optional second parameter of `switchBranch()` (FR-017, contracts/core-api.md §6). |
| [WorktreeAdapterFactory](type-aliases/WorktreeAdapterFactory.md) | Builds the local adapter for a snapshot instance: the same shape as the `rxdb.adapter()` factory. |
| [WorktreeKind](type-aliases/WorktreeKind.md) | Whether a worktree's HEAD is a branch or a commit. |
| [WorktreeLockRelease](type-aliases/WorktreeLockRelease.md) | Releases a worktree lock; settles only after the lock is truly returned; repeated calls are no-ops. |
| [WorktreeMode](type-aliases/WorktreeMode.md) | Whether a worktree can be written. |
| [WorktreeOwner](type-aliases/WorktreeOwner.md) | Who owns a worktree: a tab session (reclaimable when the session ends), or persistent (survives refresh). |
| [WorktreeState](type-aliases/WorktreeState.md) | Whether the snapshot database has been built. |
| [WorktreeStatePatch](type-aliases/WorktreeStatePatch.md) | Writing a new phase into a state slot. |
| [WorktreeTarget](type-aliases/WorktreeTarget.md) | A worktree's HEAD. |
| [WorktreeTransactionRunner](type-aliases/WorktreeTransactionRunner.md) | The facade's managed transaction: reads the capability bit, passes the gate, then hands the executor and the current epoch's adapter to the command body. |
| [WorktreeUnavailableReason](type-aliases/WorktreeUnavailableReason.md) | The reasons a worktree cannot be opened or renamed. |
| [WriteColumns](type-aliases/WriteColumns.md) | Which columns this write touched |
| [WriteEntranceDecision](type-aliases/WriteEntranceDecision.md) | The conclusion of [classifyWriteEntrance](functions/classifyWriteEntrance.md). |
| [WriteEntryOrigin](type-aliases/WriteEntryOrigin.md) | A unit's origin |
| [WriteOperation](type-aliases/WriteOperation.md) | The operation kind of a write; only `update` can fail to produce a net change. |
| [WriteTargetClass](type-aliases/WriteTargetClass.md) | The value union of [WRITE\_TARGET\_CLASSES](variables/WRITE_TARGET_CLASSES.md) |

## Variables

| Variable | Description |
| ------ | ------ |
| [COMMIT\_ERROR\_CODES](variables/COMMIT_ERROR_CODES.md) | All commit error codes, in the declaration order of [CommitErrorCode](variables/CommitErrorCode.md) |
| [CommitErrorCode](variables/CommitErrorCode.md) | The commit capability's stable error codes |
| [rxDBPluginWorkingTree](variables/rxDBPluginWorkingTree.md) | The RxDB working tree plugin factory. |
| [UNTRACKED\_BOOKKEEPING\_FIELDS](variables/UNTRACKED_BOOKKEEPING_FIELDS.md) | The second untracked category: bookkeeping fields on entity rows, exempt **globally** |
| [WORKING\_TREE\_CAPABILITY\_VERSION](variables/WORKING_TREE_CAPABILITY_VERSION.md) | The version number this capability writes into the watermark row |
| [WORKING\_TREE\_CAPTURE\_MOUNT\_POINT\_METHODS](variables/WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS.md) | The names of the mounted write primitives, in the order of the contract §1 table. |
| [WORKING\_TREE\_CAPTURE\_MOUNT\_POINTS](variables/WORKING_TREE_CAPTURE_MOUNT_POINTS.md) | The 4 mount points of contract §1, flattened into rows. |
| [WORKING\_TREE\_INITIAL\_ASYNC\_STATES](variables/WORKING_TREE_INITIAL_ASYNC_STATES.md) | All fourteen slots "nobody has asked yet"; this is the only initial value for the three framework entries. |
| [WORKTREE\_INITIAL\_ASYNC\_STATES](variables/WORKTREE_INITIAL_ASYNC_STATES.md) | The initial phase of every slot: all `idle`. |
| [WRITE\_TARGET\_CLASSES](variables/WRITE_TARGET_CLASSES.md) | The table categories a write can target |

## Functions

| Function | Description |
| ------ | ------ |
| [activationStateIdOf](functions/activationStateIdOf.md) | The primary key of a table set's activation state row: the main worktree's is WORKING\_TREE\_ACTIVATION\_STATE\_ID, a writable worktree's is its holding key (US-314 B2.2). |
| [allocateBranchGeneration](functions/allocateBranchGeneration.md) | Issues the next branch generation: makes the database increment `branchGenerationSeq` in place by 1, then reads the new value back. |
| [applyRawWriteJudgment](functions/applyRawWriteJudgment.md) | Judges and, when allowed, executes the statements; the body of the capture runtime's `gateRawWrite()` |
| [assertColdReplayInvariant](functions/assertColdReplayInvariant.md) | Verifies the cold replay invariant |
| [assertCommitUnitsEncryptedAtRest](functions/assertCommitUnitsEncryptedAtRest.md) | Validates that a batch of change units' encrypted columns are all in their at-rest form (FR-038). |
| [assertSwitchBranchPreconditions](functions/assertSwitchBranchPreconditions.md) | Validates the preconditions the caller **explicitly proposed** (FR-017, FR-020). |
| [assertSwitchTargetIntact](functions/assertSwitchTargetIntact.md) | Validates that the **target** branch's commit graph is reachable and intact (FR-051, SC-013). |
| [assertWorkingTreeEntryCountIntact](functions/assertWorkingTreeEntryCountIntact.md) | Validates that the redundant column matches the actual entry row count (data-model.md §2.6). |
| [breaksReadOnly](functions/breaksReadOnly.md) | Whether these statements should be rejected on a read-only connection: statements that change data, plus `PRAGMA` / `SET` / `set_config()` that change session state. |
| [buildVersionedDomain](functions/buildVersionedDomain.md) | Computes the versioned domain from entity registrations |
| [captureChanges](functions/captureChanges.md) | Captures a batch of change log rows into working tree units (**the whole batch shares one `unitId`**) |
| [captureCrudWrite](functions/captureCrudWrite.md) | The four steps that wrap an ordinary CRUD write into working tree capture (FR-039) |
| [checkRestoreCompatibility](functions/checkRestoreCompatibility.md) | Judges whether "restoring the working tree to the target commit" is feasible on the current client. |
| [classifyWriteEntrance](functions/classifyWriteEntrance.md) | Judges whether a write should become a working tree unit |
| [commitWorkingTree](functions/commitWorkingTree.md) | Commits all uncommitted units in the current branch's working tree (FR-041). |
| [createWorkingTreeActivationRow](functions/createWorkingTreeActivationRow.md) | Builds the activation state's initial row (not yet persisted). |
| [createWorkingTreeCaptureBatch](functions/createWorkingTreeCaptureBatch.md) | Builds the capture context shared by a batch of changes |
| [createWorkingTreeCapturePort](functions/createWorkingTreeCapturePort.md) | Wraps a transaction executor into a [WorkingTreeCapturePort](interfaces/WorkingTreeCapturePort.md) with a **single identity** |
| [createWorkingTreeCaptureRuntime](functions/createWorkingTreeCaptureRuntime.md) | Builds the capture runtime from a database's entity registrations |
| [createWorkingTreeCommands](functions/createWorkingTreeCommands.md) | Wires the fourteen commands onto the state slots. |
| [createWorkingTreeCommitsInitialRows](functions/createWorkingTreeCommitsInitialRows.md) | Builds all initial rows of the epic-006 persistence layer (§8 steps 2–3) |
| [createWorktreeCommands](functions/createWorktreeCommands.md) | Builds a set of worktree commands. |
| [decodeCommitChangeSetUnit](functions/decodeCommitChangeSetUnit.md) | Restores a `rxdb_commit_change_set` row back into change unit content. |
| [decodeCommitChangeSetUnits](functions/decodeCommitChangeSetUnits.md) | The batch version of [decodeCommitChangeSetUnit](functions/decodeCommitChangeSetUnit.md), **preserving input order**. |
| [decodeWorkingTreePatch](functions/decodeWorkingTreePatch.md) | The inverse of [encodeWorkingTreePatch](functions/encodeWorkingTreePatch.md). |
| [diffColdReplay](functions/diffColdReplay.md) | Compares the replay result against the actual contents of the business tables |
| [discardWorkingTree](functions/discardWorkingTree.md) | Reverts the current branch's working tree entirely back to the current HEAD (FR-016). |
| [encodeWorkingTreePatch](functions/encodeWorkingTreePatch.md) | Encodes a patch into the form that can be stored in the `patch` / `inversePatch` json columns. |
| [findCommitConflict](functions/findCommitConflict.md) | Compares the three captured slots and produces the first mismatch (FR-031). |
| [findFirstReplayIncompatibility](functions/findFirstReplayIncompatibility.md) | Finds the first incompatible node along a **chosen** path. |
| [fingerprintOf](functions/fingerprintOf.md) | The fingerprint of a unit's current state (FNV-1a/32, fixed 8 hex digits). |
| [foldWorkingTreeEntry](functions/foldWorkingTreeEntry.md) | Folds a capture into an existing working tree unit |
| [gateBulkWrite](functions/gateBulkWrite.md) | Judges a batch write; the write primitive factory is only called when allowed |
| [gateExternalNotify](functions/gateExternalNotify.md) | Judges an external update notification; the notification body only executes when allowed |
| [isCommitChangeSetPageEmpty](functions/isCommitChangeSetPageEmpty.md) | The empty of `commitChanges()`: this commit has no change units (baseline nodes are like this). |
| [isCommitErrorCode](functions/isCommitErrorCode.md) | Judges whether a value is a registered commit error code |
| [isCommitLogPageEmpty](functions/isCommitLogPageEmpty.md) | The empty of `listCommits()`: this branch has no history yet. |
| [isWorkingTreeCaptureMountPoint](functions/isWorkingTreeCaptureMountPoint.md) | - |
| [isWorkingTreeDiffEmpty](functions/isWorkingTreeDiffEmpty.md) | The empty of `diff()`: this page has no changes to show. |
| [isWorkingTreeRestoreSessionEmpty](functions/isWorkingTreeRestoreSessionEmpty.md) | The empty of `restoreSession()`: the current branch has no unfinished restore session. |
| [isWorkingTreeStatusEmpty](functions/isWorkingTreeStatusEmpty.md) | The empty of `status()`: no uncommitted changes. |
| [isWorktreeCommitTarget](functions/isWorktreeCommitTarget.md) | Whether it is a commit view. |
| [judgeRawWrite](functions/judgeRawWrite.md) | Judges whether a raw call should be dispatched |
| [producesWorkingTreeEntry](functions/producesWorkingTreeEntry.md) | Does this trusted path produce a working tree unit |
| [readActiveBranchToken](functions/readActiveBranchToken.md) | Reads this instance's current branch token: the branch held by the mounted table set |
| [readActiveRestoreSession](functions/readActiveRestoreSession.md) | Reads the current branch's unfinished restore session, or `null` when there is none. |
| [readBranchEntries](functions/readBranchEntries.md) | Reads a branch's current uncommitted entries, ascending by `id` |
| [readCommitChangeSetPage](functions/readCommitChangeSetPage.md) | Reads all change units of a commit. |
| [readCommitLogPage](functions/readCommitLogPage.md) | Reads a branch's commit history, translated into a public-facing page. |
| [readMountedWorktreeTableSet](functions/readMountedWorktreeTableSet.md) | The table set this instance is currently mounted on: the one `worktreeTableSet$` delivers at subscription time (US-314 C1). |
| [readWorkingTreeActivationState](functions/readWorkingTreeActivationState.md) | Reads the activation state: `activationRevision` from the row of the table set this instance is mounted on, `branchGenerationSeq` from the main worktree's row. |
| [readWorkingTreeDiff](functions/readWorkingTreeDiff.md) | Unfolds a branch's `HEAD ↔ working tree` diff (FR-005). |
| [readWorkingTreeStateRow](functions/readWorkingTreeStateRow.md) | Fetches this branch's working tree state row. |
| [readWorkingTreeStatus](functions/readWorkingTreeStatus.md) | Reads the current branch's working tree summary (FR-004). |
| [replayWorkingTree](functions/replayWorkingTree.md) | Replays the net state from `HEAD projection + all working tree units` |
| [restoreWorkingTree](functions/restoreWorkingTree.md) | Writes the target commit's contents back into the current working tree as new uncommitted changes (FR-013). |
| [selectRestoreReplayPath](functions/selectRestoreReplayPath.md) | Chooses the deterministic path to walk back for "restoring to the target node". |
| [toCapturedWrite](functions/toCapturedWrite.md) | Folds a change log row into a write awaiting capture |
| [trackWorkingTreeCommand](functions/trackWorkingTreeCommand.md) | Runs a command, emitting loading → success \| error along the way. |
| [trackWorkingTreeQuery](functions/trackWorkingTreeQuery.md) | Runs a query, emitting loading → success \| empty \| error along the way. |

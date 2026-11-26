# VersionManager

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L62)

Version manager

Responsible for managing the database's branches, undo/redo and version history:
- branch management (create, delete, switch, merge), plus comparing two branches and previewing a merge without switching
- undo/redo operations (database level)
- automatic invalidation of the redo stack (when new operations arrive)

## Remarks

Push/pull sync is **not** here. After US-025 phase D it lives on `@aiao/rxdb-plugin-sync`'s
`SyncManager`, and the two sides meet only through the single narrow interface [VersionManager.syncBridge](#syncbridge).

## Properties

### pushInFlight \{#pushinflight\}

```ts
readonly pushInFlight: PushInFlightRegistry;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L87)

**`Internal`**

The registry of "which changes are currently flying to the remote".

#### Remarks

The only meeting point of push and undo. Push claims ranges before the remote round trip, and undo treats claimed ranges as pushed —
without it, an undo inside the round-trip window would fork local and remote permanently; see [PushInFlightRegistry](../classes/PushInFlightRegistry.md).

It hangs on `VersionManager` because both sides only meet through it: `pushRepository(vm, …)` gets it directly,
`HistoryManager` gets it via `rxdb.versionManager`. Its lifetime follows the instance and is never shared across instances.

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L132)

The host instance

***

### syncBridge \{#syncbridge\}

```ts
readonly syncBridge: SyncHistoryBridge;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L98)

**`Internal`**

The small slice of history capabilities handed to the sync plugin.

#### Remarks

Passes closures instead of `this.historyManager`: `init()` rebuilds the manager after a disconnect-reconnect,
and the bridge must fetch it fresh every time; see createSyncHistoryBridge.

## Accessors

### pullableCount$ \{#pullablecount\}

#### Get Signature

```ts
get pullableCount$(): Observable<number>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L120)

Stream of the number of remote changes waiting to be pulled

Accumulated by listening to remote events (INSERT/UPDATE/DELETE):
- count +1 when a remote change event arrives
- count resets to 0 after a pull completes

Used by the UI to show "N remote updates available to pull"

##### Returns

`Observable`&lt;`number`&gt;

***

### pushableCount$ \{#pushablecount\}

#### Get Signature

```ts
get pushableCount$(): Observable<number>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L107)

Stream of the number of pushable changes

Tracks the number of effective local unpushed changes in real time:
- excludes reverted changes (revertChangeId != null)
- excludes changes pulled from the remote (remoteId != null)

##### Returns

`Observable`&lt;`number`&gt;

## Methods

### compareBranches() \{#comparebranches\}

```ts
compareBranches(fromBranchId, toBranchId): Promise<BranchComparison>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:495](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L495)

Compares the entity differences of two branches' current states, without switching the active branch or writing to the database.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fromBranchId` | `string` | The start branch |
| `toBranchId` | `string` | The end branch |

#### Returns

`Promise`&lt;[`BranchComparison`](BranchComparison.md)&gt;

The differing entities; `entries` is an empty array when both sides are identical (including the same branch)

#### Throws

RxDBError When either branch does not exist

#### Remarks

An entry's `patch` is the value at the endpoint and `inversePatch` the value at the start point, the same semantics as the working tree's `diff()`.
Values come from the change log as-is, undecoded; bookkeeping fields such as `remoteId` and audit times (`ENTITY_BOOKKEEPING_FIELDS`) are not differences.

Mounted on a writable checkout, only members of that table set are compared, same rule as [previewMerge](#previewmerge): entities not in the shadow table set (entities synced by QueryCache)
stay untouched when switching branches in the checkout, and listing them would contradict what switching actually reads.

#### Example

```ts
// what feature changed relative to the current branch main
const { entries } = await rxdb.versionManager.compareBranches('main', 'feature');
for (const entry of entries) console.log(entry.operation, entry.entity, entry.entityId, entry.patch);
```

***

### createBranch() \{#createbranch\}

```ts
createBranch(branchId, fromChangeId?): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L268)

Creates a new branch

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | The branch id |
| `fromChangeId?` | `number` | Which changeId to create the new branch from |

#### Returns

`Promise`&lt;[`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)&gt;

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L237)

Removes all event listeners and subscriptions and destroys the HistoryManager.

#### Returns

`void`

#### Remarks

Idempotent. Transaction depth and generation are reset together: teardown may happen mid-transaction, and keeping the counters
would make the next epoch believe it starts inside an unsettled transaction.

***

### getCurrentBranch() \{#getcurrentbranch\}

```ts
getCurrentBranch(): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:617](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L617)

Gets the current branch; activates (or creates) `main` when no branch is active.

#### Returns

`Promise`&lt;[`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)&gt;

#### Remarks

The two-stage split is intentional:

- **hot path** (an active branch already exists) opens no transaction. Every event in the sync plugin's remote event pipeline calls it
  (`sync-listeners`' `filterByBranch`); wrapping the whole thing in a transaction would fix concurrency,
  but would make every read contend for the concurrency-1 write queue slot.
- only the **cold path** (no active branch found) opens a transaction and **re-runs the check inside it** (double check).
  Otherwise two concurrent calls would both reach `create` and the second would fail on the primary key.

***

### getLocalRepositories() \{#getlocalrepositories\}

```ts
getLocalRepositories(): Promise<{
  adapter: LocalRxDBAdapter;
  branchRepository: LocalRxDBBranchRepository;
  changeRepository: LocalRxDBChangeRepository;
}>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:588](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L588)

Gets the system table repositories on the local adapter.

#### Returns

`Promise`&lt;\{
  `adapter`: [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md);
  `branchRepository`: [`LocalRxDBBranchRepository`](../../rxdb/interfaces/LocalRxDBBranchRepository.md);
  `changeRepository`: [`LocalRxDBChangeRepository`](../../rxdb/interfaces/LocalRxDBChangeRepository.md);
\}&gt;

`branchRepository` / `changeRepository` together with the local adapter they belong to

#### Remarks

Re-resolved via `localAdapter$` every time, never cached: the adapter changes with connection epochs, and a cached copy
would point at the dismantled old instance after a reconnect.

***

### getRemoteRepositories() \{#getremoterepositories\}

```ts
getRemoteRepositories(): Promise<{
  adapter: RemoteRxDBAdapter;
  branchRepository: RemoteRxDBBranchRepository;
  changeRepository: RemoteRxDBChangeRepository;
}>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:601](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L601)

Gets the system table repositories on the remote adapter.

#### Returns

`Promise`&lt;\{
  `adapter`: [`RemoteRxDBAdapter`](../../rxdb/type-aliases/RemoteRxDBAdapter.md);
  `branchRepository`: [`RemoteRxDBBranchRepository`](../../rxdb/interfaces/RemoteRxDBBranchRepository.md);
  `changeRepository`: [`RemoteRxDBChangeRepository`](../../rxdb/interfaces/RemoteRxDBChangeRepository.md);
\}&gt;

`branchRepository` / `changeRepository` together with the remote adapter they belong to

#### Remarks

Without a configured remote, `remoteAdapter$` never emits and the call hangs forever — intentionally: the sync path
is only taken when a remote is configured anyway, and returning an empty shell would only defer the "no remote configured" report to a deeper place.

***

### history() \{#history\}

```ts
history<T>(options?): HistoryScopeAPI;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:558](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L558)

Gets the history API for a specific scope

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | `T` \| `InstanceType`&lt;`T`&gt; | Scope options: - no argument → database scope (the whole database) - an EntityType class → repository scope (all records of that entity) - an entity instance → entity scope (that instance's history) |

#### Returns

[`HistoryScopeAPI`](../../rxdb/interfaces/HistoryScopeAPI.md)

The unified history API interface

#### Example

```ts
// database level
const dbHistory = versionManager.history();

// repository level (all User records)
const userHistory = versionManager.history(User);

// entity level (a single user)
const entityHistory = versionManager.history(userInstance);
```

***

### init() \{#init\}

```ts
init(): void;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L148)

Attaches the transaction and local-write event listeners and starts recording history.

#### Returns

`void`

#### Remarks

Pairs with [VersionManager.destroy](#destroy) and is reentrant: the `HistoryManager` destroyed by the previous round
has already torn down its subscriptions, so a new one is built here instead of reusing the old — reusing would feed the new epoch's
changes into an already-completed stream.

Issues no adapter reads or writes and does not connect the instance (the branch stream only queries when `connected$` is true), so it can
(and must) run before the bootstrap chain: `HistoryManager`'s branch stream must be subscribed before the first `rxdb_change` event,
and installed late, that batch of changes misses history.

***

### mergeBranch() \{#mergebranch\}

```ts
mergeBranch(sourceBranchId, options?): Promise<MergeBranchResult>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:440](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L440)

Merges a branch

Merges the source branch's changes into the currently active branch (the target branch).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sourceBranchId` | `string` | The source branch ID |
| `options?` | [`MergeBranchOptions`](../../rxdb/interfaces/MergeBranchOptions.md) | Merge options |

#### Returns

`Promise`&lt;[`MergeBranchResult`](../../rxdb/interfaces/MergeBranchResult.md)&gt;

The merge result

#### Remarks

Supports two strategies:
- `squash` (default): compresses all of the source branch's changes into a minimal operation set applied at once; the target branch gets one group of change records
- `normal`: applies the source branch's changes one by one; each change produces an independent change record on the target branch (preserving historical detail)

The undo/redo history is cleared after merging, because a merge is irreversible.
Optionally deletes the source branch after merging with `deleteSource: true`.

#### Example

```typescript
// squash merge (default)
const result = await rxdb.versionManager.mergeBranch('feature-x');
console.log(`Merged ${result.merged} changes`);

// normal merge
const result = await rxdb.versionManager.mergeBranch('feature-x', {
  strategy: 'normal'
});

// delete the source branch after merging
const result = await rxdb.versionManager.mergeBranch('feature-x', {
  deleteSource: true
});
```

***

### previewMerge() \{#previewmerge\}

```ts
previewMerge(sourceBranchId, options?): Promise<MergePreview>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:523](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L523)

Previews what merging a branch into the current active branch would land, without writing to the database.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sourceBranchId` | `string` | The source branch |
| `options?` | [`MergePreviewOptions`](MergePreviewOptions.md) | See [MergePreviewOptions](MergePreviewOptions.md); entries and `merged` are computed per the merge strategy |

#### Returns

`Promise`&lt;[`MergePreview`](MergePreview.md)&gt;

The entities the merge would land, a `merged` count consistent with the subsequent [mergeBranch](#mergebranch), and the overwrite annotations

#### Throws

RxDBError When there is no active branch, when merging into itself, or when the source branch does not exist — the same error message as [mergeBranch](#mergebranch)

#### Remarks

A merge is a one-way overwrite: business fields changed on the target branch since the fork are overwritten by the source branch's values, entities the source deleted disappear together with the target's edits,
and source branch updates on entities the target deleted are no-ops. Each entry's `conflict` marks these situations; see [MergePreviewConflict](../type-aliases/MergePreviewConflict.md).

#### Example

```ts
const preview = await rxdb.versionManager.previewMerge('feature');
const overwritten = preview.entries.filter(entry => entry.conflict !== null);
if (overwritten.length === 0) await rxdb.versionManager.mergeBranch('feature');
```

***

### refreshChildForks() \{#refreshchildforks\}

```ts
refreshChildForks(): void;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:283](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L283)

**`Internal`**

The branch topology changed; re-queries the child fork points used by the undo / redo views (US-315).

#### Returns

`void`

#### Remarks

This class's own create, delete, merge and switch already call it; provided for plugins that write branch rows through other paths (the working tree plugin's create-branch-from-commit).
The branch table writes no change log, so live queries cannot see these writes — an explicit notification is required. It only affects the views: `undo()` / `redo()` re-query right before executing anyway.

***

### removeBranch() \{#removebranch\}

```ts
removeBranch(branchId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L291)

Deletes a branch

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | The branch id |

#### Returns

`Promise`&lt;`void`&gt;

***

### resetSessionState() \{#resetsessionstate\}

```ts
resetSessionState(): void;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L257)

Invalidates the history context accumulated in this connection: clears the undo sessions and pullable counts of all branches.

#### Returns

`void`

#### Remarks

For scenarios like switching databases / reconnecting where "the local data has been wholly replaced". It clears **all** branches, not just the
current one — the whole data source was replaced, and the rows pointed at by the other branches' undo entries are likewise gone.

***

### restoreEntity() \{#restoreentity\}

```ts
restoreEntity<T>(entity, options): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:572](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L572)

Restores a deleted entity

Re-inserts the entity from the `inversePatch` in the RxDBChange record;
the restore operation itself generates a new RxDBChange record (which can be pushed to the remote).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The deleted entity instance (needs to carry the metadata) |
| `options` | [`RestoreEntityOptions`](../../rxdb/interfaces/RestoreEntityOptions.md) | Restore options, including the changeId (the ID of the DELETE-type RxDBChange record) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The restored entity instance

***

### switchBranch() \{#switchbranch\}

```ts
switchBranch(branchId, preconditions?): Promise<void>;
```

Defined in: [packages/rxdb-plugin-history/src/VersionManager.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/VersionManager.ts#L315)

Switches to the given branch

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | The target branch ID |
| `preconditions?` | [`RxDBBranchSwitchPreconditions`](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md) | [Optional] conditions that must hold before switching; when omitted, behavior is byte-for-byte the same as before |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The redo stack is cleared automatically after switching branches, because redo history is no longer valid on the new branch.
If the target branch is the current branch, it returns directly, avoiding unnecessary work.

The second parameter is a **pure extension**: no existing call site needs to change, and omitting it states nothing. Made default-on,
`switchBranch(id)` would start throwing on any database with uncommitted changes — and the history subsystem itself calls it
(undo/redo replay, redo invalidation), where the working tree is never empty, so default-on would make undo unusable whenever there are changes.

The conditions are validated by a **capability plugin**; this method reads none of their fields: the criteria are
the tables contributed by `@aiao/rxdb-plugin-working-tree`, which this package neither knows nor should know.
The reverse direction (this package importing that plugin) is a dependency cycle that nx's graph plugin would reject `run-many` on immediately.

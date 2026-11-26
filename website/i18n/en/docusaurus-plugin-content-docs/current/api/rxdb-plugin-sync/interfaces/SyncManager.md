# SyncManager

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L62)

The sync manager

Responsible for push/pull sync at the whole-database and single-repository granularities:

- `pull` / `push` / `sync`: whole database
- `pullRepository` / `pushRepository` / `syncRepository` / `bulkSync`: per repository
- `getRepositorySyncStatus` / `checkRepositoryUpdates` / `cleanupExpired`: status and cleanup
- `getRepositoryDependencyGraph` / `getRepositorySyncOrder`: dependency graph and sync order

## Remarks

Before US-025 phase D these entries hung on the `VersionManager` of
`@aiao/rxdb-plugin-history`. The reason for the split is that the two things
have different lifecycles: undo/redo must be in place before the first
`rxdb_change`, while push/pull sync only makes sense with a remote configured.

One **one-directional** coupling remains after the split: at the end of a sync
round trip the undo boundary must be invalidated and the pullable count
settled, and the owners of that state are on the history side. They meet
through the one narrow interface [SyncHistoryBridge](../../rxdb-plugin-history/interfaces/SyncHistoryBridge.md) —
this plugin has `inject: ['plugin:history']`, and the history plugin knows nothing about this package.

Under multiple checkouts only the main checkout syncs (US-314, decided by the
owner on 2026-10-21): when the instance is mounted on a writable checkout, the
entries that exchange data with the remote — or tidy up local copies on sync's
behalf — throw at the door, while read-only status queries work as usual; the
sync transaction writing business tables additionally re-checks the table set
this transaction lands on, blocking a mount switch midway through sync, see
assertSyncOnMainCheckout.

## Properties

### history \{#history\}

```ts
readonly history: SyncHistoryBridge;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L117)

The small facade borrowed from the history side, provided by `rxdb.versionManager.syncBridge`

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L116)

The host instance

## Accessors

### branchSwitchGeneration \{#branchswitchgeneration\}

#### Get Signature

```ts
get branchSwitchGeneration(): number;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L95)

**`Internal`**

The local branch activation generation: incremented once when a branch switch starts and once when it commits.

##### Remarks

Push records it at planning time and compares again inside the receipt commit
transaction. Comparing branch ids alone is not enough: during a remote round
trip, after main→feature→main the id matches again, but main's business
projection has been switched away and switched back, rebuilt. Incrementing on
both start and commit exists so that "the planning happens to coincide with a
switch in progress" is recognized too.

Only covers switches within this instance; cross-tab switches are caught by the
persisted active branch read in the commit transaction (A→B→A is invisible
cross-tab, a known limitation).

##### Returns

`number`

---

### pushInFlight \{#pushinflight\}

#### Get Signature

```ts
get pushInFlight(): PushInFlightRegistry;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L78)

**`Internal`**

The registry of "which changes are flying to the remote right now".

##### Remarks

The only meeting point of push and undo, whose owner is on the history side
(`rxdb.versionManager.pushInFlight`). Both sides must read the same one, see
`PushInFlightRegistry`: push claims ranges before the remote round trip, and
undo treats claimed ranges as pushed — with one copy each, an undo inside the
round-trip window would cause a permanent fork.

##### Returns

[`PushInFlightRegistry`](../../rxdb-plugin-history/classes/PushInFlightRegistry.md)

---

### remoteBackendId \{#remotebackendid\}

#### Get Signature

```ts
get remoteBackendId(): string | null;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L107)

**`Internal`**

The remote identity this instance last verified; `null` before any verification

##### Remarks

New sync records are stamped with it, so cursors carry their owning remote from
birth, see `instantiateSyncRecord`.

##### Returns

`string` \| `null`

## Methods

### bulkSync() \{#bulksync\}

```ts
bulkSync(options?): Promise<BulkSyncResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:656](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L656)

Bulk-syncs multiple repositories

Syncs multiple repositories in one operation, with sequential or concurrent execution.

#### Parameters

| Parameter  | Type                                    | Description       |
| ---------- | --------------------------------------- | ----------------- |
| `options?` | [`BulkSyncOptions`](BulkSyncOptions.md) | Bulk sync options |

#### Returns

`Promise`&lt;[`BulkSyncResult`](BulkSyncResult.md)&gt;

The bulk sync result (with success/failure counts)

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Sequentially sync all enabled repositories
const result = await rxdb.syncManager.bulkSync();
console.log(`succeeded: ${result.succeeded}, failed: ${result.failed}`);

// Sync specific repositories
const result = await rxdb.syncManager.bulkSync({
  repositories: [{ namespace: 'public', entity: 'Todo' }, `{ namespace: 'public', entity: 'User' }`]
});

// Concurrent mode, pull only: the direction is chosen by operation; push only pushes option objects
const result = await rxdb.syncManager.bulkSync({
  concurrent: true,
  concurrency: 3,
  operation: 'pull'
});

// Check each item's result
for (const item of result.results) {
  if (item.success) {
    console.log(`${item.repository.entity}: pulled ${item.result?.pullResult.pulled ?? 0}`);
  } else {
    console.error(`${item.repository.entity}: ${item.error.message}`);
  }
}
```

---

### checkRepositoryUpdates() \{#checkrepositoryupdates\}

```ts
checkRepositoryUpdates(namespace, entity): Promise<CheckRepositoryUpdatesResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:542](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L542)

Checks whether the remote has updates without downloading data

Only queries how many new changes the remote has, never actually pulling data.
Suitable for showing a "N remote updates" hint while saving bandwidth and time.

#### Parameters

| Parameter   | Type     | Description                          |
| ----------- | -------- | ------------------------------------ |
| `namespace` | `string` | The entity namespace (e.g. "public") |
| `entity`    | `string` | The entity name (e.g. "Todo")        |

#### Returns

`Promise`&lt;[`CheckRepositoryUpdatesResult`](CheckRepositoryUpdatesResult.md)&gt;

The update check result

#### Example

```typescript
// Check whether Todo has remote updates
const result = await rxdb.syncManager.checkRepositoryUpdates('public', 'Todo');
if (result.hasUpdates) {
  console.log(`${result.pendingCount} updates can be pulled`);
  // Call pullRepository() after the user clicks the "Update" button
}
```

---

### cleanupExpired() \{#cleanupexpired\}

```ts
cleanupExpired(
   namespace,
   entity,
   options?
): Promise<CleanupExpiredResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:513](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L513)

Cleans up local expired data that no longer satisfies the filter condition

For SyncType.Filter scenarios, deletes local data that does not satisfy the
filter condition, e.g. cleaning up order data older than 30 days.

#### Parameters

| Parameter   | Type                                                | Description          |
| ----------- | --------------------------------------------------- | -------------------- |
| `namespace` | `string`                                            | The entity namespace |
| `entity`    | `string`                                            | The entity name      |
| `options?`  | [`CleanupExpiredOptions`](CleanupExpiredOptions.md) | Cleanup options      |

#### Returns

`Promise`&lt;[`CleanupExpiredResult`](CleanupExpiredResult.md)&gt;

The cleanup result

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```ts
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const { removed } = await rxdb.syncManager.cleanupExpired('public', 'Order', {
  filter: {
    combinator: 'and',
    rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
  }
});
console.log(`Removed ${removed} expired records`);
```

---

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L136)

Dismantles all listeners and subscriptions mounted by [init](#init)

#### Returns

`void`

---

### getAllRepositorySyncStatus() \{#getallrepositorysyncstatus\}

```ts
getAllRepositorySyncStatus(filter?): Promise<RepositorySyncStatus[]>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:595](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L595)

Gets the sync status of all repositories

Returns the status of all registered entities, with optional filtering.

#### Parameters

| Parameter | Type                                                                      | Description                |
| --------- | ------------------------------------------------------------------------- | -------------------------- |
| `filter?` | [`GetAllRepositorySyncStatusFilter`](GetAllRepositorySyncStatusFilter.md) | Optional filter conditions |

#### Returns

`Promise`&lt;[`RepositorySyncStatus`](RepositorySyncStatus.md)[]&gt;

The repository sync status array

#### Example

```typescript
// Get all statuses
const statuses = await rxdb.syncManager.getAllRepositorySyncStatus();

// Only get repositories with pending changes
const pending = await rxdb.syncManager.getAllRepositorySyncStatus({
  hasPendingChanges: true
});

// Only get enabled full-sync repositories
const fullSync = await rxdb.syncManager.getAllRepositorySyncStatus({
  syncType: ['full'],
  enabled: true
});
```

---

### getCurrentBranch() \{#getcurrentbranch\}

```ts
getCurrentBranch(): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L164)

Gets the current branch; activates (or creates) `main` when no branch is active.

#### Returns

`Promise`&lt;[`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)&gt;

#### Remarks

Every remote event in the sync chain calls it (`filterByBranch` of
`sync-listeners`); the hot path opens no transaction, see `getCurrentBranch`.

---

### getLocalRepositories() \{#getlocalrepositories\}

```ts
getLocalRepositories(): Promise<{
  adapter: LocalRxDBAdapter;
  branchRepository: LocalRxDBBranchRepository;
  changeRepository: LocalRxDBChangeRepository;
}>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L148)

Gets the system table repositories on the local adapter

#### Returns

`Promise`&lt;\{
`adapter`: [`LocalRxDBAdapter`](../../rxdb/type-aliases/LocalRxDBAdapter.md);
`branchRepository`: [`LocalRxDBBranchRepository`](../../rxdb/interfaces/LocalRxDBBranchRepository.md);
`changeRepository`: [`LocalRxDBChangeRepository`](../../rxdb/interfaces/LocalRxDBChangeRepository.md);
\}&gt;

---

### getRemoteRepositories() \{#getremoterepositories\}

```ts
getRemoteRepositories(): Promise<{
  adapter: RemoteRxDBAdapter;
  branchRepository: RemoteRxDBBranchRepository;
  changeRepository: RemoteRxDBChangeRepository;
}>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L153)

Gets the system table repositories on the remote adapter

#### Returns

`Promise`&lt;\{
`adapter`: [`RemoteRxDBAdapter`](../../rxdb/type-aliases/RemoteRxDBAdapter.md);
`branchRepository`: [`RemoteRxDBBranchRepository`](../../rxdb/interfaces/RemoteRxDBBranchRepository.md);
`changeRepository`: [`RemoteRxDBChangeRepository`](../../rxdb/interfaces/RemoteRxDBChangeRepository.md);
\}&gt;

---

### getRepositoryDependencyGraph() \{#getrepositorydependencygraph\}

```ts
getRepositoryDependencyGraph(): DependencyGraph;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:751](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L751)

Gets the dependency graph of all repositories

Analyzes entity relations (MANY_TO_ONE, ONE_TO_ONE) to build the dependency
graph, showing the dependency relations between repositories.

#### Returns

[`DependencyGraph`](../type-aliases/DependencyGraph.md)

The dependency graph with the dependency relations

#### Example

```typescript
const graph = rxdb.syncManager.getRepositoryDependencyGraph();

// Iterate over the dependency relations
for (const [key, dep] of graph) {
  console.log(`${key} dependsOn:`, dep.dependsOn);
  console.log(`${key} requiredBy:`, dep.requiredBy);
}
```

---

### getRepositorySyncOrder() \{#getrepositorysyncorder\}

```ts
getRepositorySyncOrder(direction): RepositoryIdentifier[];
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:775](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L775)

Gets the sync order of repositories by their dependency relations

Determines the correct sync order based on dependencies via topological sorting.

#### Parameters

| Parameter   | Type            | Description                                                           |
| ----------- | --------------- | --------------------------------------------------------------------- |
| `direction` | `SortDirection` | The sort direction: 'pull' (parents first) or 'push' (children first) |

#### Returns

[`RepositoryIdentifier`](../../rxdb/interfaces/RepositoryIdentifier.md)[]

The ordered repository list

#### Example

```typescript
// Get the pull order (parents first)
const pullOrder = rxdb.syncManager.getRepositorySyncOrder('pull');
// [User, Todo, Comment]

// Get the push order (children first)
const pushOrder = rxdb.syncManager.getRepositorySyncOrder('push');
// [Comment, Todo, User]
```

---

### getRepositorySyncStatus() \{#getrepositorysyncstatus\}

```ts
getRepositorySyncStatus(namespace, entity): Promise<RepositorySyncStatus>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:566](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L566)

Gets the sync status of a single repository

Returns the complete sync status, including:

- syncType (full/remote/local/disabled)
- pushableCount (the number of local changes awaiting push)
- pullableCount (the number of remote changes available to pull)
- recent sync timestamps

#### Parameters

| Parameter   | Type     | Description                          |
| ----------- | -------- | ------------------------------------ |
| `namespace` | `string` | The entity namespace (e.g. "public") |
| `entity`    | `string` | The entity name (e.g. "Todo")        |

#### Returns

`Promise`&lt;[`RepositorySyncStatus`](RepositorySyncStatus.md)&gt;

The repository sync status

#### Example

```typescript
const status = await rxdb.syncManager.getRepositorySyncStatus('public', 'Todo');
console.log(`sync type: ${status.syncType}`);
console.log(`awaiting push: ${status.pushableCount}, available to pull: ${status.pullableCount}`);
```

---

### init() \{#init\}

```ts
init(): void;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L121)

Mounts the two chains: connected$ auto-push and remote event counting

#### Returns

`void`

---

### pull() \{#pull\}

```ts
pull(options?): Promise<PullResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L209)

Pulls changes from the remote and applies them to the local database

When autoSync=false, changes cached by Realtime are applied first, then remote changes are pulled.

#### Parameters

| Parameter  | Type                                                  | Description            |
| ---------- | ----------------------------------------------------- | ---------------------- |
| `options?` | [`PullOptions`](../../rxdb/interfaces/PullOptions.md) | Optional configuration |

#### Returns

`Promise`&lt;[`PullResult`](../../rxdb/interfaces/PullResult.md)&gt;

The pull result

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Basic usage
const result = await rxdb.syncManager.pull();
console.log(`Pulled ${result.pulled} changes`);

// Pull everything
const result = await rxdb.syncManager.pull({ fetchAll: true });
```

---

### pullRepository() \{#pullrepository\}

```ts
pullRepository(
   namespace,
   entity,
   options?
): Promise<PullRepositoryResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:359](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L359)

Pulls the remote changes of a specific repository

Provides entity-type-level fine-grained sync control, with cascade sync to
automatically pull related entities.

#### Parameters

| Parameter   | Type                                                                      | Description                          |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------ |
| `namespace` | `string`                                                                  | The entity namespace (e.g. "public") |
| `entity`    | `string`                                                                  | The entity name (e.g. "Todo")        |
| `options?`  | [`PullRepositoryOptions`](../../rxdb/interfaces/PullRepositoryOptions.md) | Pull options                         |

#### Returns

`Promise`&lt;[`PullRepositoryResult`](../../rxdb/interfaces/PullRepositoryResult.md)&gt;

The pull result

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Pull Todo and cascade-pull its dependencies
const result = await rxdb.syncManager.pullRepository('public', 'Todo', {
  includeRelated: true // Default: if Todo has foreign keys, User is pulled automatically
});

// No cascade pull
const result = await rxdb.syncManager.pullRepository('public', 'Todo', {
  includeRelated: false // Only pulls Todo, which may cause foreign key errors
});
```

---

### push() \{#push\}

```ts
push(options?): Promise<PushResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L261)

Pushes unsynced local changes to the remote database

Pushing automatically:

1. Queries new changes after lastPushedChangeId
2. Filters out reverted changes (revertChangeId != null)
3. Compresses changes (INSERT→DELETE discarded, INSERT→UPDATE* merged into INSERT)
4. Batch-pushes to the remote
5. Updates lastPushedChangeId and lastPushedAt

#### Parameters

| Parameter  | Type                                                  | Description            |
| ---------- | ----------------------------------------------------- | ---------------------- |
| `options?` | [`PushOptions`](../../rxdb/interfaces/PushOptions.md) | Optional configuration |

#### Returns

`Promise`&lt;[`PushResult`](../../rxdb/interfaces/PushResult.md)&gt;

The push result

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Basic usage
const result = await rxdb.syncManager.push();
console.log(`Pushed ${result.pushed} changes`);

// Custom batch size
const result = await rxdb.syncManager.push({ batchSize: 500 });
```

---

### pushRepository() \{#pushrepository\}

```ts
pushRepository(
   namespace,
   entity,
   options?
): Promise<PushRepositoryResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:412](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L412)

Pushes the local changes of a specific repository

Provides entity-type-level fine-grained sync control, with cascade sync to
automatically push dependent entities.

#### Parameters

| Parameter   | Type                    | Description                          |
| ----------- | ----------------------- | ------------------------------------ |
| `namespace` | `string`                | The entity namespace (e.g. "public") |
| `entity`    | `string`                | The entity name (e.g. "User")        |
| `options?`  | `PushRepositoryOptions` | Push options                         |

#### Returns

`Promise`&lt;[`PushRepositoryResult`](../../rxdb/interfaces/PushRepositoryResult.md)&gt;

The push result

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Push User and cascade-push its dependents
const result = await rxdb.syncManager.pushRepository('public', 'User', {
  includeRelated: true // Default: if Post references User, Post is pushed automatically
});

// No cascade push
const result = await rxdb.syncManager.pushRepository('public', 'User', {
  includeRelated: false // Only pushes User; dependent data may be incomplete
});
```

---

### rebindRemoteBackend() \{#rebindremotebackend\}

```ts
rebindRemoteBackend(): Promise<RebindRemoteBackendResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:725](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L725)

After the remote is rebuilt, rebinds the local sync records to the remote's current identity

Call it after a sync entry throws `RemoteBackendMismatchError` and you have
confirmed the new remote is the one to sync against. All pull cursors not
belonging to the new remote are cleared, and the next pull does a full pull
from scratch; push waterlines stay put, and local changes already pushed to the
old remote are not re-pushed.

#### Returns

`Promise`&lt;[`RebindRemoteBackendResult`](RebindRemoteBackendResult.md)&gt;

The identity rebound to, the replaced old identities, and the number of rebound records

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Remarks

Never happens automatically: with the remote address misconfigured to another
project, an automatic rebind would pull other people's data in and push local
pending changes out. After a successful rebind, the remote identity error in
`syncState` is cleared along with it.

#### Example

```typescript
try {
  await rxdb.syncManager.sync();
} catch (error) {
  if (!(error instanceof RemoteBackendMismatchError)) throw error;
  if (await confirm('The remote has been rebuilt. Re-pull from the new remote?')) {
    await rxdb.syncManager.rebindRemoteBackend();
    await rxdb.syncManager.pull({ fetchAll: true });
  }
}
```

---

### refreshPullableCount() \{#refreshpullablecount\}

```ts
refreshPullableCount(): Promise<number>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:608](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L608)

Recalculates the pending pull count from each repository's persisted remote waterline

#### Returns

`Promise`&lt;`number`&gt;

The current total of remote changes awaiting pull

#### Remarks

Called by the remote adapter after a live subscription resumes. If live events
arrive again during the refresh, keep the larger of the two values, avoiding
overwriting notifications that arrived after the query snapshot.

---

### sync() \{#sync\}

```ts
sync(options?): Promise<SyncResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:300](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L300)

Runs a complete sync operation (pull first, then push)

Recommended after reconnecting, ensuring:

1. Remote latest changes are fetched first (avoid overwriting other people's data)
2. Local changes are pushed afterwards

#### Parameters

| Parameter       | Type                                                                                                                                  | Description            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `options?`      | \{ `pull?`: [`PullOptions`](../../rxdb/interfaces/PullOptions.md); `push?`: [`PushOptions`](../../rxdb/interfaces/PushOptions.md); \} | Optional configuration |
| `options.pull?` | [`PullOptions`](../../rxdb/interfaces/PullOptions.md)                                                                                 | -                      |
| `options.push?` | [`PushOptions`](../../rxdb/interfaces/PushOptions.md)                                                                                 | -                      |

#### Returns

`Promise`&lt;[`SyncResult`](../../rxdb/interfaces/SyncResult.md)&gt;

The sync result (with pull and push results)

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Basic usage
const result = await rxdb.syncManager.sync();
console.log(`Pulled ${result.pullResult.pulled}, Pushed ${result.pushResult.pushed}`);
```

---

### syncBranches() \{#syncbranches\}

```ts
syncBranches(): Promise<SyncBranchesResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L184)

Syncs all branch information from the remote to the local database

New remote branch → created locally (local: false, remote: true)
Existing local remote branch → remote flag updated to true
Purely local branches → unaffected

#### Returns

`Promise`&lt;[`SyncBranchesResult`](SyncBranchesResult.md)&gt;

The sync result

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
const result = await rxdb.syncManager.syncBranches();
console.log(`created ${result.created}, updated ${result.updated}`);
```

---

### syncRepository() \{#syncrepository\}

```ts
syncRepository(
   namespace,
   entity,
   options?
): Promise<SyncRepositoryResult>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:461](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L461)

Syncs a specific repository (pull first, then push)

Merges the pull and push of a single repository into one operation, guaranteeing the correct execution order.
Recommended when consistency of a specific entity type's data must be ensured.

#### Parameters

| Parameter   | Type                    | Description                                       |
| ----------- | ----------------------- | ------------------------------------------------- |
| `namespace` | `string`                | The entity namespace (e.g. "public")              |
| `entity`    | `string`                | The entity name (e.g. "Todo")                     |
| `options?`  | `SyncRepositoryOptions` | Sync options (configure pull and push separately) |

#### Returns

`Promise`&lt;`SyncRepositoryResult`&gt;

The sync result (with pull and push results)

#### Throws

RxDBError when the instance is mounted on a writable checkout (US-314: only the main checkout syncs)

#### Example

```typescript
// Basic usage
const result = await rxdb.syncManager.syncRepository('public', 'Todo');
console.log(`Pulled ${result.pullResult.pulled}, Pushed ${result.pushResult.pushed}`);

// Custom pull and push options
const result = await rxdb.syncManager.syncRepository('public', 'Todo', {
  pull: { limit: 500, fetchAll: true },
  push: `{ batchSize: 100 }`
});
```

---

### verifyRemoteBackend() \{#verifyremotebackend\}

```ts
verifyRemoteBackend(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-sync/src/SyncManager.ts:693](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/SyncManager.ts#L693)

**`Internal`**

Verifies the remote identity and binds unbound sync records to it

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

`RemoteBackendMismatchError` when sync records are bound to another remote
identity: the remote is rebuilt, the change log is cleared, or the remote
address points at a different database. The error is also written into
`lastError` of `rxdb.syncState`, and not a single row is written

#### Remarks

Called at the door of every entry that exchanges data with the remote; the
materialization source also calls it before touching the remote. With no remote
configured there is nothing to verify, and it returns directly.

Verifying once at the door is not enough: one sync can run long, the remote can
be rebuilt midway, and later round trips land on the new database. So it is
called again on every pull round (when there are changes) and before a push
receipt lands in the database — the round trip between the door call and this
call is what counts as progress on this remote; a mismatch stops everything,
and neither cursors nor waterlines advance.

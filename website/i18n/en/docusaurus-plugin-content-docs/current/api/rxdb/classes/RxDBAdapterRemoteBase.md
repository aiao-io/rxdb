# RxDBAdapterRemoteBase

Defined in: [packages/rxdb/src/rxdb-adapter.ts:944](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L944)

Database adapter base class (remote)

## Extends

- [`RxDBAdapterBase`](RxDBAdapterBase.md)

## Extended by

- [`RemoteRxDBChangeRepository`](../interfaces/RemoteRxDBChangeRepository.md)
- [`RxDBAdapterSupabase`](../../rxdb-adapter-supabase/classes/RxDBAdapterSupabase.md)
- [`RxDBAdapterHttp`](../../rxdb-adapter-http/classes/RxDBAdapterHttp.md)

## Constructors

### Constructor

```ts
new RxDBAdapterRemoteBase(rxdb): RxDBAdapterRemoteBase;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `rxdb`    | [`RxDB`](RxDB.md) |

#### Returns

`RxDBAdapterRemoteBase`

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`constructor`](RxDBAdapterBase.md#constructor)

## Properties

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L378)

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`repository_cache`](RxDBAdapterBase.md#repository_cache)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterRemoteBase, RepositoryInstance<EntityType>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:377](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L377)

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`repository_map`](RxDBAdapterBase.md#repository_map)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`rxdb`](RxDBAdapterBase.md#rxdb)

## Methods

### backendId() \{#backendid\}

```ts
abstract backendId(): Promise<string>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:958](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L958)

The remote identity: an identifier generated when the remote database is created and changed after it is rebuilt

#### Returns

`Promise`&lt;`string`&gt;

The current remote database's identity value; repeated calls on the same remote database must return the same value

#### Remarks

The pull cursor is a remote change id, only monotonic within the same remote database. After the remote is rebuilt or its change log is cleared and recounted,
an old client's cursor would skip past all of the new database's ids, making pulls silently come up empty. The sync plugin stores this value and the cursor in the same row
(`RxDBSync.remoteBackendId`), comparing it before exchanging data with the remote and stopping the sync when they do not match.

Both a remote rebuild and a change log clear must produce a new value; things that do not change across rebuilds like the connection address or project name cannot substitute.
Adapters without change log sync support throw an unsupported error outright; do not return a placeholder value.

---

### branchExists()? \{#branchexists\}

```ts
branchExists ? branchId : Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1107)

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `branchId` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

---

### fetchMetadata() \{#fetchmetadata\}

```ts
abstract fetchMetadata(entityName, query): Observable<QueryCacheEntityMetadata[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1080](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1080)

Gets entity metadata for freshness comparison (QueryCache only)

Returns only the `{ id, updatedAt }` metadata, reducing network transfer by 90%+ compared to full data.
This is the core capability of the QueryCache sync strategy.

#### Parameters

| Parameter    | Type                                                         | Description     |
| ------------ | ------------------------------------------------------------ | --------------- |
| `entityName` | `string`                                                     | Entity name     |
| `query`      | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`unknown`&gt; | Query condition |

#### Returns

`Observable`&lt;[`QueryCacheEntityMetadata`](../interfaces/QueryCacheEntityMetadata.md)[]&gt;

`Observable<QueryCacheEntityMetadata[]>` - entity IDs and updatedAt

#### Example

```typescript
adapter.fetchMetadata('Product', { where: { status: 'active' } }).subscribe(metadata => {
  // metadata: [{ id: 'p1', updatedAt: '2026-01-12T10:00:00Z' }, ...]
});
```

#### Remarks

Implementations must satisfy the following two contracts, both are load-bearing premises for the caller, not suggestions (RV-001 / RV-002):

**1. Emit the full result exactly once, then `complete`.**
Paginated implementations must assemble all pages and emit once, not once per page. The reason is that the semantics of the two call sites are exactly opposite:

- `QueryCacheEngine` (`#syncQuery` / `#syncAndReadLocal`) uses `forkJoin` — only the **last**
  emission is kept, and **nothing is ever produced without complete**. Per-page emission would silently drop all metadata except the last page,
  misjudge them as orphans and evict them from the local cache.
- `query-cache-primary`'s `#fetchMetadata` uses `firstValueFrom` — only the **first** emission is taken.
  Per-page emission would make it only see the first page.

**2. Transport failures must be judged `true` by `isNetworkError`, business failures must be judged `false`.**
The easiest and most reliable approach is to throw `NetworkOfflineError` directly for transport failures (the 1st
criterion of `isNetworkError` is `instanceof`, independent of any string convention, true on hit).

Only when throwing **other** error types should you watch out for the numeric `status` property: the 2nd criterion is "has a numeric `status` ⇒ not a
network error", and it decides before the 3rd, 4th and 5th criteria (`errno` / `name` / `TypeError` + message regex).
That is, a transport failure carrying `status` would be judged a business failure, while business failures **should** carry `status` —
exactly why the HTTP adapter gives `HttpResponseError` a status code and gives `HttpDisconnectedError` none.

Wrong classification does not error; it only makes `find({ offlineFallback: true })` throw instead of returning the cache when offline;
the reverse mistake (treating an RLS rejection as offline) would give callers a stale cache while hiding the real failure reason.

---

### findByIds() \{#findbyids\}

```ts
abstract findByIds<T>(entityName, ids): Observable<T[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1103)

Bulk-fetches complete data by ID list (QueryCache only)

Used to pull stale or missing data and avoid the N+1 problem.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter    | Type       | Description                 |
| ------------ | ---------- | --------------------------- |
| `entityName` | `string`   | Entity name                 |
| `ids`        | `string`[] | The entity ID list to fetch |

#### Returns

`Observable`&lt;`T`[]&gt;

`Observable<T[]>` - the complete entity data

#### Example

```typescript
adapter.findByIds('Product', ['p1', 'p2', 'p3']).subscribe(products => {
  // products: [{ id: 'p1', name: 'Product A', ... }, ...]
});
```

#### Remarks

The same contract as RxDBAdapter.fetchMetadata: **emit exactly once** (chunked `ids` queries must be merged before emitting;
callers also use `forkJoin`) and `complete`; transport failures must throw errors judged `true` by `isNetworkError`.

---

### getChangeCount() \{#getchangecount\}

```ts
abstract getChangeCount(
   sinceId,
   repositoryFilter?,
   branchId?
): Promise<{
  count: number;
  latestChangeId: number;
}>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:993](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L993)

Gets the remote change count (lightweight, no data download)

This method only queries how many new changes exist remotely and returns no actual data.
Used to implement the checkRepositoryUpdates() feature and save bandwidth.

#### Parameters

| Parameter           | Type       | Description                                                |
| ------------------- | ---------- | ---------------------------------------------------------- |
| `sinceId`           | `number`   | The starting changeId (that ID not included)               |
| `repositoryFilter?` | `string`[] | An optional entity filter list                             |
| `branchId?`         | `string`   | An optional branch ID (only counts changes of that branch) |

#### Returns

`Promise`&lt;\{
`count`: `number`;
`latestChangeId`: `number`;
\}&gt;

The change count and the latest changeId

---

### getRepository() \{#getrepository\}

```ts
abstract getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L382)

#### Type Parameters

| Type Parameter                                                                                         | Default type                                             |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md)            | -                                                        |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; | [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`getRepository`](RxDBAdapterBase.md#getrepository)

---

### mergeChanges() \{#mergechanges\}

```ts
abstract mergeChanges(
   actions,
   branchId?,
   changes?
): Promise<RemoteMergeResult>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1020](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1020)

Applies the compacted changes to the remote entity tables

Implementation strategy (Supabase):

1. Convert actions (Map) into RemoteChange records
2. Inside a transaction:
   a) Write into the remote RemoteChange table (for other clients to pull)
   b) Directly operate on the remote entity tables (INSERT/UPDATE/DELETE)

#### Parameters

| Parameter   | Type                                                            | Description                                                                              |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `actions`   | [`SwitchVersionActions`](../interfaces/SwitchVersionActions.md) | The compacted change operation set (pushed from the local side)                          |
| `branchId?` | `string`                                                        | Branch ID (used to set branchId in remote change records)                                |
| `changes?`  | [`IRxDBChange`](../interfaces/IRxDBChange.md)[]                 | The complete raw change records (optional, used to preserve the complete change history) |

#### Returns

`Promise`&lt;[`RemoteMergeResult`](../interfaces/RemoteMergeResult.md)&gt;

The maximum ID of the created remote RxDBChange (used to update lastPullRemoteChangeId)

#### Remarks

When `changes` is provided, the implementation must use the client ID and local change ID as the idempotency key. Retrying the same batch must not re-execute
entity side effects, and must return, for each local change ID, the same remote ID obtained from the first commit.

---

### pullBranches()? \{#pullbranches\}

```ts
pullBranches?(): Promise<RemoteBranchInfo[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1109)

#### Returns

`Promise`&lt;[`RemoteBranchInfo`](../interfaces/RemoteBranchInfo.md)[]&gt;

---

### pullChanges() \{#pullchanges\}

```ts
abstract pullChanges(
   sinceId,
   limit?,
   repositoryFilter?,
   filter?,
   branchId?
): Promise<RemoteChange[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:974](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L974)

Pulls change records from the remote

#### Parameters

| Parameter           | Type                                        | Description                                                  |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `sinceId`           | `number`                                    | Pulls the changes after this ID (that ID not included)       |
| `limit?`            | `number`                                    | The maximum number to pull                                   |
| `repositoryFilter?` | `string`[]                                  | An optional entity filter list (for repository-level sync)   |
| `filter?`           | [`RuleGroup`](../type-aliases/RuleGroup.md) | An optional row-level filter condition (for SyncType.Filter) |
| `branchId?`         | `string`                                    | An optional branch ID (only pulls changes of that branch)    |

#### Returns

`Promise`&lt;[`RemoteChange`](../interfaces/RemoteChange.md)[]&gt;

The change record array, sorted by id ASC

#### Remarks

When the filter parameter is provided, it JOINs the entity tables and applies the filter condition,
returning only the change records of entities that match.

---

### pullChangesBatch()? \{#pullchangesbatch\}

```ts
pullChangesBatch?(
   requests,
   limit,
   branchIds?
): Promise<RemoteChange[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1037](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1037)

Bulk-pulls the change records of multiple entities (one HTTP request)

Each entity can have a different sinceId (watermark); server-side OR filtering
fetches all entities' changes in a single request.

#### Parameters

| Parameter    | Type                                                      | Description                                                         |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `requests`   | [`PullBatchRequest`](../interfaces/PullBatchRequest.md)[] | The pull request of each entity (namespace + entity name + sinceId) |
| `limit`      | `number`                                                  | The maximum number to pull                                          |
| `branchIds?` | `string`[]                                                | The branch ID list (ancestor branches may be included)              |

#### Returns

`Promise`&lt;[`RemoteChange`](../interfaces/RemoteChange.md)[]&gt;

The change record array, sorted by id ASC

---

### pushBranches()? \{#pushbranches\}

```ts
pushBranches ? branches : (
  Promise<{
    skipped: string[];
    synced: number;
  }>
);
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1105)

#### Parameters

| Parameter  | Type                                  |
| ---------- | ------------------------------------- |
| `branches` | `Record`&lt;`string`, `unknown`&gt;[] |

#### Returns

`Promise`&lt;\{
`skipped`: `string`[];
`synced`: `number`;
\}&gt;

---

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L384)

#### Type Parameters

| Type Parameter                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt-1"></a> `RT` _extends_ [`RepositoryInstance`](../interfaces/RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter         | Type                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                               |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterRemoteBase`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterBase`](RxDBAdapterBase.md).[`repository`](RxDBAdapterBase.md#repository)

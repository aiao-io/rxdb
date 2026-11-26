# RemoteRxDBChangeRepository

Defined in: [packages/rxdb/src/system/types.remote.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L66)

Remote repository interface for RxDBChange

## Extends

- [`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md)
- [`IRxDBAdapter`](IRxDBAdapter.md)

## Properties

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L268)

The adapter name, same as the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify adapters by it

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`name`](IRxDBAdapter.md#name)

---

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L378)

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`repository_cache`](../classes/RxDBAdapterRemoteBase.md#repository_cache)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RemoteRxDBChangeRepository, RepositoryInstance<EntityType>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:377](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L377)

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`repository_map`](../classes/RxDBAdapterRemoteBase.md#repository_map)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`rxdb`](../classes/RxDBAdapterRemoteBase.md#rxdb)

## Methods

### backendId() \{#backendid\}

```ts
abstract backendId(): Promise<string>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:958](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L958)

Remote identity: an identifier generated when the remote database is created and changed when it is rebuilt

#### Returns

`Promise`&lt;`string`&gt;

The identity value of the current remote database; repeated calls on the same remote database must return the same value

#### Remarks

The pull cursor is a remote change id, which is only monotonic within one remote database. After the remote is rebuilt or its change log is cleared and recounted,
an old client's cursor would skip past all the ids of the new database and the pull would silently come up empty. The sync plugin stores this value in the same row as the cursor
(`RxDBSync.remoteBackendId`), compares it before exchanging data with the remote, and stops syncing when they do not match.

Both a remote rebuild and a change log clear must produce a new value; a connection address, project name or anything else that survives a rebuild cannot be a substitute.
Adapters that do not support change log sync throw an unsupported error directly; do not return a placeholder value.

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`backendId`](../classes/RxDBAdapterRemoteBase.md#backendid)

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

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`branchExists`](../classes/RxDBAdapterRemoteBase.md#branchexists)

---

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L279)

Establishes the connection and brings the system tables up to the current watermark.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](IRxDBAdapter.md)&gt;

Itself, for convenient chaining

#### Remarks

Table creation and system migration both happen here (see `isCurrentRxDBSystemVersion`), so it can be slow,
and it may throw `UnsupportedRxDBSystemVersionError` because the database is newer than this process.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`connect`](IRxDBAdapter.md#connect)

---

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L81)

count query

#### Parameters

| Parameter | Type                                                                                                                                                        | Description   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`CountOptions`](CountOptions.md)&lt;_typeof_ [`RxDBChange`](../classes/RxDBChange.md), [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md)&gt; | Query options |

#### Returns

`Promise`&lt;`number`&gt;

Returns the number of query results

---

### create() \{#create\}

```ts
create(entity): Promise<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L88)

Creates an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md) | The entity to create |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the created entity

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L288)

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again afterwards.
Implementations must be idempotent — calling it while not connected is a no-op, not an error.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`disconnect`](IRxDBAdapter.md#disconnect)

---

### fetchMetadata() \{#fetchmetadata\}

```ts
abstract fetchMetadata(entityName, query): Observable<QueryCacheEntityMetadata[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1080](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1080)

Fetches entity metadata for freshness comparison (QueryCache only)

Returns only `{ id, updatedAt }` metadata, cutting network transfer by 90%+ compared with full data.
This is the core capability of the QueryCache sync strategy.

#### Parameters

| Parameter    | Type                                                         | Description      |
| ------------ | ------------------------------------------------------------ | ---------------- |
| `entityName` | `string`                                                     | Entity name      |
| `query`      | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`unknown`&gt; | Query conditions |

#### Returns

`Observable`&lt;[`QueryCacheEntityMetadata`](QueryCacheEntityMetadata.md)[]&gt;

`Observable<QueryCacheEntityMetadata[]>` - entity IDs and updatedAt

#### Example

```typescript
adapter.fetchMetadata('Product', { where: { status: 'active' } }).subscribe(metadata => {
  // metadata: [{ id: 'p1', updatedAt: '2026-01-12T10:00:00Z' }, ...]
});
```

#### Remarks

Implementations must satisfy the following two contracts; both are preconditions the callers **load-bear** on, not suggestions (RV-001 / RV-002):

**1. Emit the full result exactly once, then `complete`.**
Paged implementations must stitch all pages together and emit once, not once per page. The reason is that the two call sites have exactly opposite semantics:

- `QueryCacheEngine` (`#syncQuery` / `#syncAndReadLocal`) uses `forkJoin` — only the **last**
  emission is kept, and **without `complete` it never produces at all**. Emitting page by page would silently drop all metadata except the last page,
  which would then be misjudged as orphans and evicted from the local cache.
- `#fetchMetadata` of `query-cache-primary` uses `firstValueFrom` — only the **first** emission is taken.
  Emitting page by page would leave it seeing only the first page.

**2. Transport failures must be judged `true` by `isNetworkError`, and business failures `false`.**
The cheapest and most reliable approach is to throw `NetworkOfflineError` directly on transport failure (`isNetworkError`'s first
criterion is `instanceof`, which does not depend on any string convention and returns `true` on a hit).

Only when throwing **other** error types must one beware of a numeric `status` property: the second criterion is "numeric `status` ⇒ not
a network error", and it decides before criteria 3, 4 and 5 (`errno` / `name` / `TypeError` + message regex).
In other words, a transport failure carrying `status` would be judged a business failure, while a business failure **should** carry `status` —
that is exactly why HTTP adapters let `HttpResponseError` carry a status code and `HttpDisconnectedError` not.

Misclassification does not throw; it only makes `find({ offlineFallback: true })` throw an exception instead of returning cache when offline;
getting it backwards (treating an RLS rejection as offline) leaves the caller with stale cache and no sight of the real failure reason.

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`fetchMetadata`](../classes/RxDBAdapterRemoteBase.md#fetchmetadata)

---

### find() \{#find\}

```ts
find(options): Promise<RxDBChange[]>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L72)

find query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                             | Description   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOptions`](FindOptions.md)&lt;_typeof_ [`RxDBChange`](../classes/RxDBChange.md), [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)[]&gt;

Returns the query result array

---

### findByIds() \{#findbyids\}

```ts
abstract findByIds<T>(entityName, ids): Observable<T[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1103)

Fetches full data in bulk by ID list (QueryCache only)

Used to pull stale or missing data, avoiding the N+1 problem.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter    | Type       | Description                     |
| ------------ | ---------- | ------------------------------- |
| `entityName` | `string`   | Entity name                     |
| `ids`        | `string`[] | The list of entity IDs to fetch |

#### Returns

`Observable`&lt;`T`[]&gt;

`Observable<T[]>` - full entity data

#### Example

```typescript
adapter.findByIds('Product', ['p1', 'p2', 'p3']).subscribe(products => {
  // products: [{ id: 'p1', name: 'Product A', ... }, ...]
});
```

#### Remarks

Same contract as RxDBAdapter.fetchMetadata: **emit exactly once** (chunked `ids` queries must be merged before emitting,
the caller also uses `forkJoin`) and `complete`; transport failures must throw an error judged `true` by `isNetworkError`.

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`findByIds`](../classes/RxDBAdapterRemoteBase.md#findbyids)

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

Gets the count of remote changes (lightweight, downloads no data)

This method only queries how many new changes the remote has and returns no actual data.
Used to implement the checkRepositoryUpdates() feature, saving bandwidth.

#### Parameters

| Parameter           | Type       | Description                                             |
| ------------------- | ---------- | ------------------------------------------------------- |
| `sinceId`           | `number`   | The starting changeId (exclusive)                       |
| `repositoryFilter?` | `string`[] | Optional entity filter list                             |
| `branchId?`         | `string`   | Optional branch ID (counts changes of that branch only) |

#### Returns

`Promise`&lt;\{
`count`: `number`;
`latestChangeId`: `number`;
\}&gt;

The change count and the latest changeId

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`getChangeCount`](../classes/RxDBAdapterRemoteBase.md#getchangecount)

---

### getRepository() \{#getrepository\}

```ts
abstract getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L382)

Gets the repository instance of this entity on **this adapter**.

#### Type Parameters

| Type Parameter                                                                              | Default type                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | -                                          |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](IRepository.md)&lt;`T`&gt;    | [`IRepository`](IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

#### Remarks

Returns the repository on the adapter axis (see [AdapterRepositoryConstructor](../type-aliases/AdapterRepositoryConstructor.md)),
not the same object as the facade repository `RxDB.getRepository()` that users normally get.

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`getRepository`](../classes/RxDBAdapterRemoteBase.md#getrepository)

---

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L332)

Whether the table for this entity already exists in the database.

#### Parameters

| Parameter    | Type                                          |
| ------------ | --------------------------------------------- |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

It asks about the **physical table**, not whether the entity is registered in the metadata.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`isTableExisted`](IRxDBAdapter.md#istableexisted)

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

Applies compacted changes to the remote entity tables

Implementation strategy (Supabase):

1. Convert actions (Map) into RemoteChange records
2. Within a transaction:
   a) Write into the remote RemoteChange table (for other clients to pull)
   b) Operate directly on the remote entity tables (INSERT/UPDATE/DELETE)

#### Parameters

| Parameter   | Type                                              | Description                                                                          |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `actions`   | [`SwitchVersionActions`](SwitchVersionActions.md) | The compacted change operation set (pushed from local)                               |
| `branchId?` | `string`                                          | Branch ID (used to set branchId in the remote change records)                        |
| `changes?`  | [`IRxDBChange`](IRxDBChange.md)[]                 | The complete original change records (optional, for keeping the full change history) |

#### Returns

`Promise`&lt;[`RemoteMergeResult`](RemoteMergeResult.md)&gt;

The maximum ID of the created remote RxDBChange (used to update lastPullRemoteChangeId)

#### Remarks

When `changes` is provided, the implementation must use client ID and local change ID as the idempotency key. Retrying the same batch must not repeat
the entity side effects, and must return, for each local change ID, the same remote ID obtained from its first commit.

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`mergeChanges`](../classes/RxDBAdapterRemoteBase.md#mergechanges)

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L324)

Mutates entities in bulk (create/update/remove)

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                 |
| --------- | ---------------------------------------------------- |
| `options` | [`RxDBMutationsMap`](RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`mutations`](IRxDBAdapter.md#mutations)

---

### pullBranches()? \{#pullbranches\}

```ts
pullBranches?(): Promise<RemoteBranchInfo[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1109)

#### Returns

`Promise`&lt;[`RemoteBranchInfo`](RemoteBranchInfo.md)[]&gt;

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`pullBranches`](../classes/RxDBAdapterRemoteBase.md#pullbranches)

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

| Parameter           | Type                                        | Description                                                |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `sinceId`           | `number`                                    | Pulls changes after this ID (exclusive)                    |
| `limit?`            | `number`                                    | Maximum number to pull                                     |
| `repositoryFilter?` | `string`[]                                  | Optional entity filter list (for repository-level sync)    |
| `filter?`           | [`RuleGroup`](../type-aliases/RuleGroup.md) | Optional row-level filter conditions (for SyncType.Filter) |
| `branchId?`         | `string`                                    | Optional branch ID (pulls changes of that branch only)     |

#### Returns

`Promise`&lt;[`RemoteChange`](RemoteChange.md)[]&gt;

Change record array, ordered by id ASC

#### Remarks

When the filter parameter is provided, the entity tables are JOINed and the filter conditions applied,
returning only the change records corresponding to entities that match the conditions.

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`pullChanges`](../classes/RxDBAdapterRemoteBase.md#pullchanges)

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

Pulls change records for multiple entities in bulk (a single HTTP request)

Each entity can have a different sinceId (watermark), combined by server-side OR filtering
to fetch the changes of all entities in one request.

#### Parameters

| Parameter    | Type                                        | Description                                                          |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| `requests`   | [`PullBatchRequest`](PullBatchRequest.md)[] | The pull request for each entity (namespace + entity name + sinceId) |
| `limit`      | `number`                                    | Maximum number to pull                                               |
| `branchIds?` | `string`[]                                  | Branch ID list (ancestor branches are supported)                     |

#### Returns

`Promise`&lt;[`RemoteChange`](RemoteChange.md)[]&gt;

Change record array, ordered by id ASC

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`pullChangesBatch`](../classes/RxDBAdapterRemoteBase.md#pullchangesbatch)

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

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`pushBranches`](../classes/RxDBAdapterRemoteBase.md#pushbranches)

---

### rawQuery()? \{#rawquery\}

```ts
rawQuery?(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L346)

Executes a raw SQL query (for scenarios like conditional UPDATE that bypass the ORM)

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](RawQueryResult.md)&gt;

#### Remarks

**An optional method**, and that has consequences: core cannot wrap it on the adapter's behalf the way it does for the four write primitives,
so on a database with the commit capability enabled, the raw write gate can only be done by each adapter's own implementation calling
`gateRawWrite(sql, ctx, …)` (`ctx` taken from
[RxDBAdapterLocalBase.workingTreeRawWriteContext](../classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)). Missing that one line
means every write on this path bypasses change capture.

Writes going through here do not pass the entity Proxy, so they produce no entity events and cached instances do not refresh automatically.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`rawQuery`](IRxDBAdapter.md#rawquery)

---

### remove() \{#remove\}

```ts
remove(entity): Promise<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L106)

Removes an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md) | The entity to remove |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the removed entity

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L319)

Removes entities in bulk.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The removed entities

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`removeMany`](IRxDBAdapter.md#removemany)

---

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L384)

#### Type Parameters

| Type Parameter                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt-1"></a> `RT` _extends_ [`RepositoryInstance`](RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter         | Type                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                                    |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../type-aliases/AdapterRepositoryConstructor.md)&lt;`RemoteRxDBChangeRepository`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterRemoteBase`](../classes/RxDBAdapterRemoteBase.md).[`repository`](../classes/RxDBAdapterRemoteBase.md#repository)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L312)

Writes entities in bulk (insert if absent, update if present).

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities after persistence; fields backfilled by the database, such as primary keys and database-side defaults, only have values here

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`saveMany`](IRxDBAdapter.md#savemany)

---

### update() \{#update\}

```ts
update(entity, patch): Promise<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L96)

Updates an entity

#### Parameters

| Parameter | Type                                                                                     | Description          |
| --------- | ---------------------------------------------------------------------------------------- | -------------------- |
| `entity`  | [`RxDBChange`](../classes/RxDBChange.md)                                                 | The entity to update |
| `patch`   | `Partial`&lt;`InstanceType`&lt;_typeof_ [`RxDBChange`](../classes/RxDBChange.md)&gt;&gt; | Update data          |

#### Returns

`Promise`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;

Returns the updated entity

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L296)

The version number of the underlying database engine (such as SQLite's `3.45.0`), used for diagnostics and capability judgment.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`) — that is RxDB's own number.

#### Inherited from

[`IRxDBAdapter`](IRxDBAdapter.md).[`version`](IRxDBAdapter.md#version)

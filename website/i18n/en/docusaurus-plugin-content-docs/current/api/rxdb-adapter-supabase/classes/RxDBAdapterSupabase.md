# RxDBAdapterSupabase

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L98)

The Supabase adapter

## Example

```typescript
const rxdb = new RxDB({
  adapters: {
    supabase: rxdb => new RxDBAdapterSupabase(rxdb, {
      supabaseUrl: 'https://xxx.supabase.co',
      supabaseKey: 'your-anon-key'
    })
  }
});
```

## Extends

- [`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md)

## Implements

- [`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)

## Constructors

### Constructor

```ts
new RxDBAdapterSupabase(rxdb, options): RxDBAdapterSupabase;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L113)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `options` | [`SupabaseAdapterOptions`](../interfaces/SupabaseAdapterOptions.md) |

#### Returns

`RxDBAdapterSupabase`

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`constructor`](../../rxdb/classes/RxDBAdapterRemoteBase.md#constructor)

## Properties

### name \{#name\}

```ts
readonly name: "supabase" = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L107)

The adapter name, equal to the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` identify it by this value

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`name`](../../rxdb/interfaces/IRxDBAdapter.md#name)

***

### options \{#options\}

```ts
readonly options: SupabaseAdapterOptions;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L115)

***

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`repository_cache`](../../rxdb/classes/RxDBAdapterRemoteBase.md#repository_cache)

***

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterSupabase, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`repository_map`](../../rxdb/classes/RxDBAdapterRemoteBase.md#repository_map)

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:347

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`rxdb`](../../rxdb/classes/RxDBAdapterRemoteBase.md#rxdb)

## Accessors

### client \{#client\}

#### Get Signature

```ts
get client(): SupabaseClient;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L109)

##### Returns

`SupabaseClient`

## Methods

### backendId() \{#backendid\}

```ts
backendId(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L185)

The remote identity: the id in the single-row table `rxdb_backend`

#### Returns

`Promise`&lt;`string`&gt;

The remote database's identity value; a new value after a database rebuild or `TRUNCATE rxdb_change`

#### Throws

When the remote has no identity row (the reference SQL was not executed, or that row was deleted)

#### Remarks

Not cached: the remote may be rebuilt during a connection, and the sync plugin
must read the current value before every exchange of data with the remote.

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`backendId`](../../rxdb/classes/RxDBAdapterRemoteBase.md#backendid)

***

### branchExists() \{#branchexists\}

```ts
branchExists(branchId): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:592](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L592)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branchId` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`branchExists`](../../rxdb/classes/RxDBAdapterRemoteBase.md#branchexists)

***

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L137)

Establishes the connection and brings the system tables up to the current waterline.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

Itself, for chaining

#### Remarks

Table creation and system migration both happen here (see
`isCurrentRxDBSystemVersion`), so it can be slow, and it can throw
`UnsupportedRxDBSystemVersionError` when the database is newer than this process.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`connect`](../../rxdb/interfaces/IRxDBAdapter.md#connect)

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L150)

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter
instance can `connect()` again afterwards. Implementations must be idempotent —
calling while not connected is a no-op rather than an error.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`disconnect`](../../rxdb/interfaces/IRxDBAdapter.md#disconnect)

***

### fetchMetadata() \{#fetchmetadata\}

```ts
fetchMetadata(entityName, queryFilter): Observable<QueryCacheEntityMetadata[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:645](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L645)

Gets entity metadata for freshness comparison (QueryCache only)

Returns only `{ id, updatedAt }` metadata, reducing network traffic by 90%+ compared to full data.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `queryFilter` | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)&lt;`unknown`&gt; | - |

#### Returns

`Observable`&lt;[`QueryCacheEntityMetadata`](../../rxdb/interfaces/QueryCacheEntityMetadata.md)[]&gt;

`Observable<QueryCacheEntityMetadata[]>`

#### Example

```typescript
adapter.fetchMetadata('Product', { combinator: 'and', rules: [{ field: 'status', operator: 'eq', value: 'active' }] })
  .subscribe(metadata => console.log(metadata));
```

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`fetchMetadata`](../../rxdb/classes/RxDBAdapterRemoteBase.md#fetchmetadata)

***

### findByIds() \{#findbyids\}

```ts
findByIds<T>(entityName, ids): Observable<T[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:691](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L691)

Batch-fetches full data by an ID list (QueryCache only)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `ids` | `string`[] | The list of entity IDs to fetch |

#### Returns

`Observable`&lt;`T`[]&gt;

`Observable<T[]>`

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`findByIds`](../../rxdb/classes/RxDBAdapterRemoteBase.md#findbyids)

***

### getChangeCount() \{#getchangecount\}

```ts
getChangeCount(
   sinceId, 
   repositoryFilter?, 
   branchId?
): Promise<{
  count: number;
  latestChangeId: number;
}>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:416](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L416)

Gets the number of remote changes (lightweight, no data download) (T042, US2)

This method only queries how many new changes the remote has and returns no
actual data. Used to implement checkRepositoryUpdates(), saving bandwidth.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sinceId` | `number` | The starting changeId (exclusive) |
| `repositoryFilter?` | `string`[] | The optional entity filter list |
| `branchId?` | `string` | - |

#### Returns

`Promise`&lt;\{
  `count`: `number`;
  `latestChangeId`: `number`;
\}&gt;

The change count and the latest changeId

#### Example

```typescript
// Query the number of new changes of the Todo entity
const { count, latestChangeId } = await adapter.getChangeCount(100, ['Todo']);
console.log(`${count} new changes, latest ID: ${latestChangeId}`);
```

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`getChangeCount`](../../rxdb/classes/RxDBAdapterRemoteBase.md#getchangecount)

***

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L270)

Gets the repository instance of the entity on **this adapter**.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) | - |
| <a id="type-parameter-rt"></a> `RT` *extends* [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt; | [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |

#### Returns

`RT`

#### Remarks

Returns the adapter-axis repository (see [AdapterRepositoryConstructor](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)),
which is not the same object as the facade repository `RxDB.getRepository()` users normally get.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`getRepository`](../../rxdb/interfaces/IRxDBAdapter.md#getrepository)

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`getRepository`](../../rxdb/classes/RxDBAdapterRemoteBase.md#getrepository)

***

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L291)

Whether the table corresponding to the entity already exists in the database.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

Asks about the **physical table**, not whether the entity is registered in metadata.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`isTableExisted`](../../rxdb/interfaces/IRxDBAdapter.md#istableexisted)

***

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions, 
   branchId?, 
   changes?
): Promise<RemoteMergeResult>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:462](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L462)

Applies compressed changes to the remote (transactional)

Via the rxdb_mutations RPC, in a single transaction:
1. Writes the RxDBChange table (for other clients to pull)
2. Applies actions to the entity tables (INSERT/UPDATE/DELETE)
3. Automatically skips the sync triggers (p_skip_sync=true)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `actions` | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) | The compressed change operation set |
| `branchId?` | `string` | The branch ID |
| `changes?` | [`IRxDBChange`](../../rxdb/interfaces/IRxDBChange.md)[] | The complete original change records (optional, for keeping full history) |

#### Returns

`Promise`&lt;[`RemoteMergeResult`](../../rxdb/interfaces/RemoteMergeResult.md)&gt;

#### Remarks

Payloads always locate rows by the `id` key and never read the entity primary
key's columnName: both ends of the sync protocol (the change log trigger records
`NEW.id`, `rxdb_mutations` judges conflicts by `id`) bind the business table's
`id` column, so sync entities whose primary key column was renamed only locally
still push normally.

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`mergeChanges`](../../rxdb/classes/RxDBAdapterRemoteBase.md#mergechanges)

***

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L229)

Batch-modifies entities (transactional)

Calls the `rxdb_mutations` stored procedure via the PostgreSQL RPC, executing
all operations in a single database transaction for atomicity.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`RxDBMutationsMap`](../../rxdb/interfaces/RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The final server rows of inserts and modifications, plus the original entities of deletes

#### Throws

When an entity in the batch has its primary key `id` mapped to another physical column; the RPC is never issued

#### Throws

`42501` on a refused modification, `RX001` when the target row does not exist; the whole batch rolls back

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`mutations`](../../rxdb/interfaces/IRxDBAdapter.md#mutations)

***

### pullBranches() \{#pullbranches\}

```ts
pullBranches(): Promise<RemoteBranchInfo[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:603](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L603)

#### Returns

`Promise`&lt;[`RemoteBranchInfo`](../../rxdb/interfaces/RemoteBranchInfo.md)[]&gt;

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pullBranches`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pullbranches)

***

### pullChanges() \{#pullchanges\}

```ts
pullChanges(
   sinceId, 
   limit?, 
   repositoryFilter?, 
   filter?, 
   branchId?
): Promise<RemoteChange[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:331](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L331)

Pulls change records from the remote

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `sinceId` | `number` | `undefined` | Pulls changes after this ID (exclusive) |
| `limit?` | `number` | `1000` | The maximum number to pull |
| `repositoryFilter?` | `string`[] | `undefined` | The optional entity filter list (for repository-level sync) |
| `filter?` | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)&lt;`unknown`&gt; | `undefined` | The optional row-level filter condition (for SyncType.Filter) |
| `branchId?` | `string` | `undefined` | - |

#### Returns

`Promise`&lt;[`RemoteChange`](../../rxdb/interfaces/RemoteChange.md)[]&gt;

The RxDBChange record array, sorted by id ASC

#### Remarks

Uses id rather than createdAt as the cursor to avoid duplicates from multiple
records within the same millisecond

When the filter parameter is provided, the `rxdb_pull_changes` RPC evaluates on
the change log's snapshots, without JOINing the current business tables: a hit
on either `beforeData` or `afterData` returns the whole change, and historical
changes with `snapshotComplete = false` are returned directly without
filtering. So filter only serves to pull less data and is not a row-level
isolation boundary.

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pullChanges`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pullchanges)

***

### pullChangesBatch() \{#pullchangesbatch\}

```ts
pullChangesBatch(
   requests, 
   limit?, 
   branchIds?
): Promise<RemoteChange[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:525](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L525)

Batch-pulls change records of multiple entities (one HTTP request)

Implemented via PostgREST's OR filter:
`or=(and(entity.eq.Todo,id.gt.6),and(entity.eq.RxDBBranch,id.gt.0),...)`

Each entity uses an independent sinceId waterline, avoiding downloading redundant data.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `requests` | [`PullBatchRequest`](../../rxdb/interfaces/PullBatchRequest.md)[] | `undefined` |
| `limit?` | `number` | `1000` |
| `branchIds?` | `string`[] | `undefined` |

#### Returns

`Promise`&lt;[`RemoteChange`](../../rxdb/interfaces/RemoteChange.md)[]&gt;

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pullChangesBatch`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pullchangesbatch)

***

### pushBranches() \{#pushbranches\}

```ts
pushBranches(branches): Promise<{
  skipped: string[];
  synced: number;
}>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:578](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L578)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branches` | `Record`&lt;`string`, `unknown`&gt;[] |

#### Returns

`Promise`&lt;\{
  `skipped`: `string`[];
  `synced`: `number`;
\}&gt;

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pushBranches`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pushbranches)

***

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L214)

Batch-removes entities (non-transactional)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`removeMany`](../../rxdb/interfaces/IRxDBAdapter.md#removemany)

***

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:352

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-rt-1"></a> `RT` *extends* [`RepositoryInstance`](../../rxdb/interfaces/RepositoryInstance.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `repositoryName` | `string` |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterSupabase`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`repository`](../../rxdb/classes/RxDBAdapterRemoteBase.md#repository)

***

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L203)

Batch-saves entities (upsert semantics, non-transactional)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-4"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Throws

When an entity in the batch has its primary key `id` mapped to another physical
column (batch writes only support the default `id` column)

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`saveMany`](../../rxdb/interfaces/IRxDBAdapter.md#savemany)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#L163)

The version number of the underlying database engine (e.g. SQLite's `3.45.0`), for diagnostics and capability judgments.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system table waterline (`RXDB_SYSTEM_SCHEMA_VERSION`), which is RxDB's own number.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`version`](../../rxdb/interfaces/IRxDBAdapter.md#version)

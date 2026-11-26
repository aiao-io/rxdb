---
sidebar_label: "QueryCacheEngine⟨T⟩"
---

# QueryCacheEngine`<T>`

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L156)

**`Experimental`**

Repository for the QueryCache sync strategy

## Example

```typescript
const repo = new QueryCacheEngine('Product', remoteAdapter, localAdapter, localReader, pendingWriteIds);

// query - automatic incremental sync
const products = await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

// single query
const product = await firstValueFrom(repo.findById('product-123'));
```

## Remarks

Production paths never `new` this class directly: entities with `SyncType.QueryCache` are wired in by the Repository via `createQueryCachePrimary` (US-020 phase A); this class only handles metadata-diff and incremental pull.

The remote's answer to a `where` is authoritative: within the local projection of this `where`, rows the remote did not return are all orphans and are deleted at sync time (US-020 AC#11). The delete scope is strictly limited to that projection — local rows not matching the `where` are outside this problem domain and must not be wiped just because "the remote didn't mention them".

Constructing this class directly is not part of the 1.0 compatibility promise; the stable surface is the indirect path of `SyncType.QueryCache` through the Repository. For the tiering rules see "Experimental tier" in `requirements/versioning-policy.md`.

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityBaseType`](../../rxdb/type-aliases/EntityBaseType.md) | [`EntityBaseType`](../../rxdb/type-aliases/EntityBaseType.md) | Entity type |

## Constructors

### Constructor

```ts
new QueryCacheEngine<T>(
   entityName, 
   remoteAdapter, 
   localAdapter, 
   localReader, 
   pendingWriteIds
): QueryCacheEngine<T>;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L214)

**`Experimental`**

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | Entity name |
| `remoteAdapter` | [`QueryCacheRemoteAdapter`](../../rxdb/interfaces/QueryCacheRemoteAdapter.md) | Remote adapter |
| `localAdapter` | [`QueryCacheLocalAdapter`](../../rxdb/interfaces/QueryCacheLocalAdapter.md) | Local adapter, responsible for the write side (upsert / delete) and single-entity metadata |
| `localReader` | [`QueryCacheLocalReader`](../../rxdb/interfaces/QueryCacheLocalReader.md)&lt;`InstanceType`&lt;`T`&gt;&gt; | Local row read outlet, usually the entity's local `IRepository` (US-020 D8) |
| `pendingWriteIds` | [`QueryCachePendingWriteIds`](../../rxdb/type-aliases/QueryCachePendingWriteIds.md) | Which ids the outbound queue currently holds; queried once before each sync round's writes |

#### Returns

`QueryCacheEngine`&lt;`T`&gt;

## Properties

### entityName \{#entityname\}

```ts
readonly entityName: string;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L205)

**`Experimental`**

Entity name

## Methods

### create() \{#create\}

```ts
create(data): Observable<InstanceType<T>>;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:414](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L414)

**`Experimental`**

Creates an entity

Executes the remote-first write strategy:
1. Write to the remote database
2. After remote success, cache the returned data locally
3. Return the complete server-generated entity (may include server-generated id/updatedAt)

When a later-sent write on the same id has already landed in the cache, this acknowledgement is still returned to the caller but no longer lands in the cache (see QueryCacheWriteOrder).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Entity data to create |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;&gt;

`Observable<InstanceType<T>>` - the created entity

#### Throws

Throws when the remote write fails; nothing is written locally

#### Example

```typescript
repo.create({ name: 'New Product', price: 99 })
  .subscribe();
```

***

### delete() \{#delete\}

```ts
delete(ids): Observable<void>;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:482](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L482)

**`Experimental`**

Deletes entities

Executes the remote-first write strategy:
1. Delete from the remote database
2. After remote success, delete from the local cache

Only clears ids still led by this delete: where a later-sent write on the same id has already landed in the cache, that row belongs to that write (see QueryCacheWriteOrder).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ids` | `string` \| `string`[] | Entity ID or array of IDs to delete |

#### Returns

`Observable`&lt;`void`&gt;

`Observable<void>`

#### Throws

Throws when the remote delete fails; nothing is deleted locally

#### Example

```typescript
repo.delete('product-123').subscribe();
repo.delete(['p1', 'p2', 'p3']).subscribe();
```

***

### find() \{#find\}

```ts
find(options): Observable<InstanceType<T>[]>;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L256)

**`Experimental`**

Queries a list of entities

Executes the QueryCache sync flow:
1. fetchMetadata → fetch remote metadata
2. getMetadataByIds → fetch local metadata
3. diffMetadata → compare to derive the IDs to pull
4. findByIds → pull only missing + stale
5. upsertMany → write into the local cache
6. return the merged result

When `localCacheFirst: true` (SWR mode):
1. Immediately return the local cache (if any)
2. Run the sync flow above in the background
3. If data changed, emit the updated result

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`QueryCacheFindOptions`](../../rxdb/interfaces/QueryCacheFindOptions.md)&lt;`T`&gt; | Query options |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

`Observable<InstanceType<T>[]>`

#### Example

```typescript
repo.find({ where: { combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'active' }] } })
  .subscribe();

// SWR mode
repo.find({ where: { ... }, localCacheFirst: true })
  .subscribe(products => {
    // First emission: local cache (immediate)
    // Second emission: remote-updated data (if changed)
  });
```

***

### findById() \{#findbyid\}

```ts
findById(id): Observable<InstanceType<T> | null>;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:352](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L352)

**`Experimental`**

Queries a single entity by ID

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity ID |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt; \| `null`&gt;

`Observable<InstanceType<T> | null>`

#### Example

```typescript
repo.findById('product-123')
  .subscribe();
```

***

### invalidateInflight() \{#invalidateinflight\}

```ts
invalidateInflight(): void;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:334](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L334)

**`Experimental`**

Invalidates all in-flight queries (US-023 D13).

#### Returns

`void`

#### Remarks

Only clears the concurrency dedup table and does **not cancel** existing subscriptions: callers that are already waiting still receive their own result, only these streams are no longer reused by later callers. The moment the remote data changed, the in-flight pull asks for the pre-change remote state; letting the post-invalidation rerun reuse it would make the rerun a no-op.

"No cancellation" only extends to the **result** layer: the stale stream still delivers its own answer to its subscribers, but no longer writes the local cache from then on (QueryCacheEngine.#isCurrent). The cache is shared, and that answer is by definition expired — letting it land would overwrite the new rows the rerun just wrote back to old values, and the error would linger until `syncStaleTime` expires: the rerun's `remember` succeeded, and within the window no one validates again.

The local write path **must** call it too (RV-053): the earlier implementation assumed "the remote was already written by this repository itself, so what in-flight queries ask for is the post-write state" and skipped the local write; re-verification disproved this timing assumption — an in-flight `findByIds` may have been sent before the write, with delivery landing after the write confirmation, carrying the old snapshot.

***

### supersedeInflightWrites() \{#supersedeinflightwrites\}

```ts
supersedeInflightWrites(ids): void;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:509](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L509)

**`Experimental`**

Declares that these ids just landed a local write that bypassed the remote (offline write).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ids` | readonly `string`[] | IDs of entities just written locally |

#### Returns

`void`

#### Remarks

This local write is ordered after all previously sent online writes: late acknowledgements of those writes are still delivered to their callers but no longer land in the cache, otherwise they would overwrite this local write — after going offline and deleting offline, a previously in-flight update ack writes the row back locally. Online writes sent after this point are unaffected.

On the production path, called by the QueryCache primary repository before every offline write; callers that use this class directly and land local writes themselves must call it too.

***

### update() \{#update\}

```ts
update(id, data): Observable<InstanceType<T>>;
```

Defined in: [rxdb-plugin-querycache/src/QueryCacheEngine.ts:450](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L450)

**`Experimental`**

Updates an entity

Executes the remote-first write strategy:
1. Update the remote database
2. After remote success, cache the returned data locally (using the latest server-returned updatedAt)
3. Return the complete updated entity

When a later-sent write on the same id has already landed in the cache, this acknowledgement is still returned to the caller but no longer lands in the cache (see QueryCacheWriteOrder).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | Entity ID |
| `data` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Fields to update |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;&gt;

`Observable<InstanceType<T>>` - the updated entity

#### Throws

Throws when the remote update fails; nothing is updated locally

#### Example

```typescript
repo.update('product-123', { price: 199 })
  .subscribe();
```

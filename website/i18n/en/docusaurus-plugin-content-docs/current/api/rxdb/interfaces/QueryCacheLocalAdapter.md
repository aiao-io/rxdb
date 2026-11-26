# QueryCacheLocalAdapter

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L49)

QueryCache adapter interface (local).

## Methods

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L55)

Deletes data in bulk.

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `entityName` | `string`   |
| `ids`        | `string`[] |

#### Returns

`Observable`&lt;`void`&gt;

---

### ~~findAll()?~~ \{#findall\}

```ts
findAll ? <T>entityName : Observable<T[]>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L71)

Gets all locally cached data.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `entityName` | `string` |

#### Returns

`Observable`&lt;`T`[]&gt;

#### Deprecated

Same as [QueryCacheLocalAdapter.findByIds](#findbyids). SWR's cache-first reads are now pushed down to
[QueryCacheLocalReader](QueryCacheLocalReader.md) by `where`, instead of "loading the whole table into memory
and then filtering in JS".

---

### ~~findByIds()?~~ \{#findbyids\}

```ts
findByIds ? <T>(entityName, ids) : Observable<T[]>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L64)

Gets complete data by ID.

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-1"></a> `T` |

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `entityName` | `string`   |
| `ids`        | `string`[] |

#### Returns

`Observable`&lt;`T`[]&gt;

#### Deprecated

Local reads have moved to [QueryCacheLocalReader](QueryCacheLocalReader.md) (US-020 D8).
This duck is no longer called by `QueryCacheEngine`: it returns raw rows rather than entity instances,
and its "adapter didn't implement it, so nothing found" degradation would disguise a cache failure as
"the remote has no data". Kept only to avoid breaking adapters that implement it; removed in the next major version.

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L51)

Gets the local metadata of the given IDs.

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `entityName` | `string`   |
| `ids`        | `string`[] |

#### Returns

`Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;

---

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L53)

Bulk-inserts/updates data.

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-2"></a> `T` |

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `entityName` | `string` |
| `data`       | `T`[]    |

#### Returns

`Observable`&lt;`void`&gt;

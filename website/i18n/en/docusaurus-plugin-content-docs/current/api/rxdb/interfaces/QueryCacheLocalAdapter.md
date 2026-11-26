# QueryCacheLocalAdapter

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L49)

QueryCache adapter interface (local)

## Methods

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L55)

Deletes data in bulk

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

Fetches all locally cached data

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

Same as [QueryCacheLocalAdapter.findByIds](#findbyids). The cache-first read of SWR is now handled by
[QueryCacheLocalReader](QueryCacheLocalReader.md), pushed down by `where`, no longer "load the whole table into memory and filter in JS".

---

### ~~findByIds()?~~ \{#findbyids\}

```ts
findByIds ? <T>(entityName, ids) : Observable<T[]>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L64)

Fetches full data by ID

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

Local reads now go through [QueryCacheLocalReader](QueryCacheLocalReader.md) (US-020 D8).
This duck is no longer called by `QueryCacheEngine`: it returns raw rows rather than entity instances,
and the "adapter not implemented means not found" fallback would disguise cache failures as "the remote has no data".
Kept only to avoid breaking adapters that implement it; to be removed in the next major version.

---

### getMetadataByIds() \{#getmetadatabyids\}

```ts
getMetadataByIds(entityName, ids): Observable<Map<string, string>>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L51)

Fetches the local metadata for the given IDs

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

Writes/updates data in bulk

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

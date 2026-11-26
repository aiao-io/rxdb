---
sidebar_label: "FindOptions⟨T, U, W⟩"
---

# FindOptions`<T, U, W>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L47)

Find query options.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |
| <a id="type-parameter-u"></a> `U` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`InstanceType`&lt;`T`&gt;&gt; |
| <a id="type-parameter-w"></a> `W` *extends* `string` | `string` |

## Properties

### groupBy? \{#groupby\}

```ts
groupBy?: string[];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L58)

Group field list (corresponds to SQL GROUP BY).
Array elements are column-name strings; identifier escaping is the adapter's job.

***

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L69)

How many rows to fetch.

#### Default

```ts
100
```

***

### localCacheFirst? \{#localcachefirst\}

```ts
localCacheFirst?: boolean;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L85)

Local cache first (stale-while-revalidate).

#### Remarks

Only effective for entities with `sync.type === SyncType.QueryCache`; other sync strategies ignore this field.
Precedence: **call &gt; configuration (`sync.local.localCacheFirst`) &gt; `false`**.
This value is part of the query task's cache key; the two modes of the same `where` are not reused across each other.

***

### offlineFallback? \{#offlinefallback\}

```ts
offlineFallback?: boolean;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L97)

Offline fallback.

#### Remarks

Only effective for entities with `sync.type === SyncType.QueryCache`; other sync strategies ignore this field.
When on, **only network failures** (unable to reach the remote) degrade to the local cache; the criterion is
`isNetworkError`. A non-2xx response from the remote is "the remote's answer" and is thrown upwards as usual.
When there is no local cache either, throws [NetworkOfflineError](../classes/NetworkOfflineError.md) instead of
silently returning an empty set. This value is part of the query task's cache key; the two modes of the same
`where` are not reused across each other.

***

### offset? \{#offset\}

```ts
offset?: number;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L75)

Pagination offset.

#### Default

```ts
0
```

***

### onSyncStats? \{#onsyncstats\}

```ts
onSyncStats?: (stats) => void;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L110)

Stats callback after a QueryCache incremental sync completes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `stats` | [`SyncStats`](SyncStats.md) |

#### Returns

`void`

#### Remarks

Only effective for entities with `sync.type === SyncType.QueryCache`.
The sync scope is the whole `where`, unrelated to `limit`; use `remoteCount` / `pulledCount`
to observe pull amplification.

The function has no reliable value identity, so it is **not** part of the query task's cache key: concurrent
queries with the same `where` share one task, and in that case only the callback of the call that arrived
first fires.

***

### orderBy? \{#orderby\}

```ts
orderBy?: OrderBy<W>[];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L53)

***

### projection? \{#projection\}

```ts
projection?: string[];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L63)

Projection field list (corresponds to SQL column selection).
Specifies the column names to return; when omitted all columns are returned (SELECT *).

***

### where \{#where\}

```ts
where: U;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L52)

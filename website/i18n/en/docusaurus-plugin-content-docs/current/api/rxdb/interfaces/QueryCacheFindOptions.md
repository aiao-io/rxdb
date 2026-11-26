---
sidebar_label: 'QueryCacheFindOptions⟨T⟩'
---

# QueryCacheFindOptions`<T>`

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L101)

Query options

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityBaseType`](../type-aliases/EntityBaseType.md) |

## Properties

### localCacheFirst? \{#localcachefirst\}

```ts
localCacheFirst?: boolean;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L126)

Local-cache-first mode (Stale-While-Revalidate)

When set to true:

1. Returns the local cache data immediately (if present)
2. Validates and updates asynchronously in the background
3. Emits the updated data if anything changed

#### Default

```ts
false;
```

---

### offlineFallback? \{#offlinefallback\}

```ts
offlineFallback?: boolean;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L136)

Offline fallback mode

When set to true:

- Returns local cache data on network errors
- Throws NetworkOfflineError if there is no local cache

#### Default

```ts
false;
```

---

### onRemoteError? \{#onremoteerror\}

```ts
onRemoteError?: (error) => void;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L115)

The reporting channel for remote validation failures that are **swallowed** in SWR mode.

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `error`   | `Error` |

#### Returns

`void`

#### Remarks

After the cache has already emitted, a remote error is swallowed into `EMPTY` (the consumer already has data, so terminating its subscription is pointless).
But "the remote did not validate successfully this time" is a fact internal bookkeeping must know: without knowing it,
the "just synced" memory would record a failed validation as a success, and no retry would happen for the whole window.
This callback only reports; it does not change the behavior of the stream.

---

### onSyncStats? \{#onsyncstats\}

```ts
onSyncStats?: (stats) => void;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L105)

Sync completion callback, used to collect performance statistics

#### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `stats`   | [`SyncStats`](SyncStats.md) |

#### Returns

`void`

---

### where \{#where\}

```ts
where: RuleGroup<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L103)

Query conditions

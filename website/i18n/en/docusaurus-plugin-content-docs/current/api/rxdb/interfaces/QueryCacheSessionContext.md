---
sidebar_label: "QueryCacheSessionContext⟨T⟩"
---

# QueryCacheSessionContext`<T>`

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L91)

Everything needed to build a session, prepared and injected by the core.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

## Properties

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L95)

The entity name in the metadata (`EntityType.name` is unreliable after bundling/minification).

***

### EntityType \{#entitytype\}

```ts
EntityType: T;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L93)

The entity class.

***

### localCacheFirst \{#localcachefirst\}

```ts
localCacheFirst: boolean;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L97)

`sync.local.localCacheFirst`, taken by the call site where the union type has been narrowed.

***

### pendingWriteIds \{#pendingwriteids\}

```ts
pendingWriteIds: QueryCachePendingWriteIds;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L114)

Which ids the query outbox currently occupies.

#### Remarks

The production implementation is `@aiao/rxdb-plugin-sync`'s `pendingQueryCacheWriteIds`, which reads the
`rxdb_change` / `rxdb_sync` system tables on the local adapter via `localAdapter$` (since US-025 phase C no
longer via `versionManager`; since phase D it leaves the core together with the outbox). **Being injected by
the core** instead of letting the plugin ask by itself is the entire content of B5: the read-path plugin keeps
zero dependency on the write-back-outbox implementation — the two plugins do not know each other and only meet
at the single line of `Repository`.

***

### reachability \{#reachability\}

```ts
reachability: ReachabilityMonitor;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L101)

Remote reachability monitor.

***

### syncStaleTime \{#syncstaletime\}

```ts
syncStaleTime: number | undefined;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L99)

`sync.local.syncStaleTime`; `undefined` means using the implementation side's default window.

***

### syncState \{#syncstate\}

```ts
syncState: SyncStateHub;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L103)

Sync state hub.

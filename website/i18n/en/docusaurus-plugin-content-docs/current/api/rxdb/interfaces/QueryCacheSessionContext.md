---
sidebar_label: "QueryCacheSessionContext⟨T⟩"
---

# QueryCacheSessionContext`<T>`

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L91)

Everything needed to build a session, all prepared and injected by the core.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

## Properties

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L95)

The entity name in the metadata (`EntityType.name` is unreliable after bundling/minification)

***

### EntityType \{#entitytype\}

```ts
EntityType: T;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L93)

The entity class

***

### localCacheFirst \{#localcachefirst\}

```ts
localCacheFirst: boolean;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L97)

`sync.local.localCacheFirst`, taken out by the call site where the union type has already been narrowed

***

### pendingWriteIds \{#pendingwriteids\}

```ts
pendingWriteIds: QueryCachePendingWriteIds;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L114)

Which ids the query outbox queue currently holds.

#### Remarks

The production implementation is `@aiao/rxdb-plugin-sync`'s `pendingQueryCacheWriteIds`, which reads the `rxdb_change` / `rxdb_sync` system tables
on the local adapter via `localAdapter$` (no longer through
`versionManager` since US-025 phase C, and moved out of the core together with the outbox queue since phase D). **Injected by the core** rather than letting the plugin ask on its own
is the whole content of B5: the read-path plugin keeps zero dependency on the write-back-to-outbox implementation — the two plugins don't know each other
and only meet at the `Repository` line.

***

### reachability \{#reachability\}

```ts
reachability: ReachabilityMonitor;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L101)

Remote reachability monitor

***

### syncStaleTime \{#syncstaletime\}

```ts
syncStaleTime: number | undefined;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L99)

`sync.local.syncStaleTime`; `undefined` means the implementation side's default window is used

***

### syncState \{#syncstate\}

```ts
syncState: SyncStateHub;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L103)

Sync state panel

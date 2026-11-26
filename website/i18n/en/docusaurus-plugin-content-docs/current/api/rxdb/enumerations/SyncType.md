# SyncType

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L28)

Sync type enumeration
Defines different data sync strategies, controlling how data is synced between local and remote

Three sync strategies are supported:

- Full: full sync, syncs all data
- Filter: filtered sync, syncs a subset of data based on filter conditions
- none: no sync, can be configured to use only local data or only remote data

## Enumeration Members

### Filter \{#filter\}

```ts
Filter: 'filter';
```

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L37)

Syncs based on filter conditions

---

### Full \{#full\}

```ts
Full: 'full';
```

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L32)

Full sync

---

### None \{#none\}

```ts
None: 'none';
```

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L58)

No sync

---

### QueryCache \{#querycache\}

```ts
QueryCache: 'QueryCache';
```

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L53)

Query cache sync mode: remote authority + local row cache, synced incrementally by query `where`.

#### Remarks

The read path is "diff remote metadata against the local projection → pull only missing/stale → read results from the local row repository", and the write path is remote-then-local. Therefore data under this strategy does **not enter the local changelog**, and there is no conflict resolution on the versioned path — the remote is the single source of truth.

The sync granularity is the whole `where`, independent of `limit`: it suits bounded result sets narrowed by `where`; narrowing by `limit` causes pull amplification (observe it via `find`'s `onSyncStats.remoteCount`).

Both adapters must have the QueryCache capability (local `getMetadataByIds` / `upsertMany` / `deleteByIds`, remote `fetchMetadata` / `findByIds`); without it, constructing the repository throws `RxDBQueryCacheCapabilityError`.

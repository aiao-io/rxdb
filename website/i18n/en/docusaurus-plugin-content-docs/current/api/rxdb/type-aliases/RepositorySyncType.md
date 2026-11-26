# RepositorySyncType

```ts
type RepositorySyncType = "full" | "filter" | "querycache" | "remote" | "local" | "none";
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L21)

Repository sync type

- `full`: bidirectional sync, local and remote data fully synced
- `filter`: filtered sync, syncs a subset of data based on filter conditions
- `querycache`: query cache sync, pulls and caches remote data on demand
- `remote`: read-only remote, data exists only remotely
- `local`: local only, data exists only locally
- `none`: no sync

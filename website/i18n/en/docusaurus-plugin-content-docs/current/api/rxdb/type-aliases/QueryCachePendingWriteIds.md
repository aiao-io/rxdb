# QueryCachePendingWriteIds

```ts
type QueryCachePendingWriteIds = () => Promise<ReadonlySet<string>>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L177)

Which entity ids the query outbox queue currently holds.

## Returns

`Promise`&lt;`ReadonlySet`&lt;`string`&gt;&gt;

The entity ids that have not been pushed back to the remote yet

## Remarks

The production implementation is `pendingQueryCacheWriteIds` of `@aiao/rxdb-plugin-sync`; it reads `rxdb_change`,
from the same source as the outbox-queue replay row condition. This type only recognizes that function, not the sync
plugin — the cache repository should not depend on the sync subsystem in reverse.

# REPOSITORY_SYNC_BEGIN_EVENT

```ts
const REPOSITORY_SYNC_BEGIN_EVENT: 'REPOSITORY_SYNC_BEGIN';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L171)

Sync of a single repository started.

## Remarks

This is a different granularity from [SYNC\_BEGIN\_EVENT](SYNC_BEGIN_EVENT.md): this family is emitted per repository, driving per-table progress displays such as "which table is syncing right now".

# REPOSITORY_SYNC_ERROR_EVENT

```ts
const REPOSITORY_SYNC_ERROR_EVENT: 'REPOSITORY_SYNC_ERROR';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L183)

Sync of a single repository failed.

## Remarks

Not necessarily accompanied by [SYNC\_ERROR\_EVENT](SYNC_ERROR_EVENT.md): a single-table failure can be swallowed by the overall sync round, which moves on to the next table and still finishes with [SYNC\_COMPLETE\_EVENT](SYNC_COMPLETE_EVENT.md).

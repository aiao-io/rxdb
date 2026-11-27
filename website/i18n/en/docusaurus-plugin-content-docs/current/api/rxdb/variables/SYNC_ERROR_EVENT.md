# SYNC_ERROR_EVENT

```ts
const SYNC_ERROR_EVENT: 'SYNC_ERROR';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L112)

A sync round was aborted by an error; mutually exclusive with [SYNC\_COMPLETE\_EVENT](SYNC_COMPLETE_EVENT.md) — a round emits only one of the two.

# TRANSACTION_ROLLBACK

```ts
const TRANSACTION_ROLLBACK: "TRANSACTION_ROLLBACK";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L59)

Transaction rollback.

## Remarks

Entity events that were already dispatched are **not** withdrawn — there is no inverse event for them. Consumers that need to follow transaction boundaries precisely should buffer the entity events inside a transaction and apply them only on COMMIT.

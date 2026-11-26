# TRANSACTION_COMMIT

```ts
const TRANSACTION_COMMIT: "TRANSACTION_COMMIT";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L50)

Transaction commit; the entity events inside this transaction were already emitted **before** it, so do not wait for it to refresh the UI.

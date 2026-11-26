# TRANSACTION_BEGIN

```ts
const TRANSACTION_BEGIN: 'TRANSACTION_BEGIN';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L47)

Transaction begin

## Remarks

May nest: a repeated BEGIN with the same `transactionId` denotes a savepoint, and different identities each queue on
their own (see [TransactionBeginEvent](../classes/TransactionBeginEvent.md)). So receiving N BEGIN events does not mean there
are N independent transactions.

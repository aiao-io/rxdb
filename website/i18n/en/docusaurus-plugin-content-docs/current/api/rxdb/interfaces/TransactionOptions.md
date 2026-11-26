# TransactionOptions

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L182)

Options for `transaction()`.

## Properties

### transactionLog? \{#transactionlog\}

```ts
readonly transactionLog?: boolean;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L186)

Whether to write the transaction log (the transactionId used by change history). Defaults to `true`.

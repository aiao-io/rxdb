# TransactionCommitEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:395](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L395)

Transaction commit event

## Constructors

### Constructor

```ts
new TransactionCommitEvent(transactionId?): TransactionCommitEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:399](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L399)

#### Parameters

| Parameter        | Type     | Description                                                                                                                     |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `transactionId?` | `string` | The identity of the transaction being committed, must match the corresponding [TransactionBeginEvent](TransactionBeginEvent.md) |

#### Returns

`TransactionCommitEvent`

## Properties

### transactionId? \{#transactionid\}

```ts
readonly transactionId?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:399](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L399)

The identity of the transaction being committed, must match the corresponding [TransactionBeginEvent](TransactionBeginEvent.md)

---

### type \{#type\}

```ts
type: 'TRANSACTION_COMMIT' = TRANSACTION_COMMIT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L396)

# TransactionRollbackEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L403)

Transaction rollback event

## Constructors

### Constructor

```ts
new TransactionRollbackEvent(transactionId?): TransactionRollbackEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L407)

#### Parameters

| Parameter        | Type     | Description                                                                                                                       |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `transactionId?` | `string` | The identity of the transaction being rolled back, must match the corresponding [TransactionBeginEvent](TransactionBeginEvent.md) |

#### Returns

`TransactionRollbackEvent`

## Properties

### transactionId? \{#transactionid\}

```ts
readonly transactionId?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L407)

The identity of the transaction being rolled back, must match the corresponding [TransactionBeginEvent](TransactionBeginEvent.md)

---

### type \{#type\}

```ts
type: 'TRANSACTION_ROLLBACK' = TRANSACTION_ROLLBACK;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:404](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L404)

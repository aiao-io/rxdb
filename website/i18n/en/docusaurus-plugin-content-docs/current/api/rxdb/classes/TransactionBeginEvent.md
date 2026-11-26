# TransactionBeginEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L380)

Transaction begin event

## Constructors

### Constructor

```ts
new TransactionBeginEvent(transactionId?): TransactionBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:391](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L391)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transactionId?` | `string` | The identity of this transaction |

#### Returns

`TransactionBeginEvent`

#### Remarks

With an identity, only a second BEGIN of the **same identity** counts as savepoint nesting; different identities form their own queues.
When omitted, all anonymous transactions share one context — this is exactly the old behavior this finding describes, kept so that
dispatchers not yet upgraded (and deployments with a single dispatcher) behave unchanged.

## Properties

### transactionId? \{#transactionid\}

```ts
readonly transactionId?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:391](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L391)

The identity of this transaction

***

### type \{#type\}

```ts
type: "TRANSACTION_BEGIN" = TRANSACTION_BEGIN;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:381](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L381)

# TransactionFun

```ts
type TransactionFun = (executor) => Promise<unknown>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L160)

Transaction callback function.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) |

## Returns

`Promise`&lt;`unknown`&gt;

## Remarks

The parameter is the [TransactionExecutor](../interfaces/TransactionExecutor.md) of this transaction — holding it is what
counts as "inside this transaction". Zero-parameter callbacks remain compatible (TS allows functions with fewer
parameters).

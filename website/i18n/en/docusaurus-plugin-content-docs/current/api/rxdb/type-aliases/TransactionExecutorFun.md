---
sidebar_label: 'TransactionExecutorFun⟨T⟩'
---

# TransactionExecutorFun`<T>`

```ts
type TransactionExecutorFun<T> = (executor) => Promise<T>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L177)

Transaction callback: the parameter is the executor of this transaction.

## Type Parameters

| Type Parameter                    | Default type |
| --------------------------------- | ------------ |
| <a id="type-parameter-t"></a> `T` | `unknown`    |

## Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) |

## Returns

`Promise`&lt;`T`&gt;

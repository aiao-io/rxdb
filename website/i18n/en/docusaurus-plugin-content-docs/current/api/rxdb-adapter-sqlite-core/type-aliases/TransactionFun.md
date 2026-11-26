# TransactionFun

```ts
type TransactionFun = (executor) => Promise<unknown>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:400](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L400)

Transaction callback.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `executor` | [`SqliteTransactionExecutor`](../classes/SqliteTransactionExecutor.md) |

## Returns

`Promise`&lt;`unknown`&gt;

## Remarks

The parameter is this transaction's [SqliteTransactionExecutor](../classes/SqliteTransactionExecutor.md) — only holding it counts as "inside this transaction".
It keeps the `execute()` passthrough, so the existing `transaction(async tx => tx.execute(sql))` style is unaffected;
the cross-adapter portable entry points are `tx.query()` / `tx.getRepository()`.

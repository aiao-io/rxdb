# TransactionExecutorState

```ts
type TransactionExecutorState = "active" | "committed" | "rolled-back";
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L15)

Transaction lifecycle state.

## Remarks

Using the executor after a terminal state (`committed` / `rolled-back`) must throw; it must not silently degrade into
"open a new transaction" or "go straight through the queue" — that would make the caller believe the write is still
inside an atomic boundary.

# createWorkingTreeCapturePort()

```ts
function createWorkingTreeCapturePort(executor, host, token, key): WorkingTreeCapturePort;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:526](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L526)

Wraps a transaction executor into a [WorkingTreeCapturePort](../interfaces/WorkingTreeCapturePort.md) with a
**single identity**

## Parameters

| Parameter  | Type                                                                  | Description                                     |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The transaction the business write is in        |
| `host`     | [`WorkingTreeCaptureHost`](../interfaces/WorkingTreeCaptureHost.md)   | The entity manager host used to build instances |
| `token`    | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md)             | The active branch token this write holds        |
| `key`      | [`WorkingTreeEntryKey`](../interfaces/WorkingTreeEntryKey.md)         | The entity identity of this capture             |

## Returns

[`WorkingTreeCapturePort`](../interfaces/WorkingTreeCapturePort.md)

The port instance

## Remarks

"A batch of one change": semantics are exactly [createWorkingTreeCaptureBatch](createWorkingTreeCaptureBatch.md),
the only difference being that `bumpWorkingTreeRevision()` **finishes on its own** — a single-port caller has
no batch object in hand and thus nowhere to call
[WorkingTreeCaptureBatch.flush](../interfaces/WorkingTreeCaptureBatch.md#flush), and holding the write back
would mean this increment never lands in the database.

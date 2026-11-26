# createWorkingTreeCapturePort()

```ts
function createWorkingTreeCapturePort(executor, host, token, key): WorkingTreeCapturePort;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:526](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L526)

Wraps a transaction executor into a [WorkingTreeCapturePort](../interfaces/WorkingTreeCapturePort.md) with a **single identity**

## Parameters

| Parameter  | Type                                                                  | Description                                    |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The transaction the business write is in       |
| `host`     | [`WorkingTreeCaptureHost`](../interfaces/WorkingTreeCaptureHost.md)   | The entity manager host for building instances |
| `token`    | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md)             | The active branch token held by this write     |
| `key`      | [`WorkingTreeEntryKey`](../interfaces/WorkingTreeEntryKey.md)         | The entity identity captured this time         |

## Returns

[`WorkingTreeCapturePort`](../interfaces/WorkingTreeCapturePort.md)

The port instance

## Remarks

"A batch of exactly one change": the semantics are completely identical to [createWorkingTreeCaptureBatch](createWorkingTreeCaptureBatch.md), the only difference is that
`bumpWorkingTreeRevision()` **finishes itself** — the single-port caller has no batch object at hand, so it has nowhere to call
[WorkingTreeCaptureBatch.flush](../interfaces/WorkingTreeCaptureBatch.md#flush); leaving it unflushed would mean this bump never lands.

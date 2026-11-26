# createWorkingTreeCaptureBatch()

```ts
function createWorkingTreeCaptureBatch(executor, host, token): WorkingTreeCaptureBatch;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L348)

Builds the capture context shared by one batch of changes

## Parameters

| Parameter  | Type                                                                  | Description                                        |
| ---------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The transaction the business writes live in        |
| `host`     | [`WorkingTreeCaptureHost`](../interfaces/WorkingTreeCaptureHost.md)   | The entity manager host for creating instances     |
| `token`    | [`ActiveBranchToken`](../interfaces/ActiveBranchToken.md)             | The active branch token this batch of writes holds |

## Returns

[`WorkingTreeCaptureBatch`](../interfaces/WorkingTreeCaptureBatch.md)

The batch context

## Remarks

The port **claims the `branchId` from the token** and does not re-read the active branch itself: re-reading once more would allow the combination "token says A, write lands on B", and the whole point of token validation is to rule that out.

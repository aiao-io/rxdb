# readWorkingTreeStatus()

```ts
function readWorkingTreeStatus(executor): Promise<WorkingTreeStatus>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L222)

Reads the current branch's working tree summary (FR-004).

## Parameters

| Parameter  | Type                                                                  | Description                                                                               |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's transaction; this function does not open its own transaction |

## Returns

`Promise`&lt;[`WorkingTreeStatus`](../interfaces/WorkingTreeStatus.md)&gt;

See [WorkingTreeStatus](../interfaces/WorkingTreeStatus.md)

## Throws

NoActiveBranchError when there is not one active branch row

## Throws

AmbiguousActiveBranchError when there are multiple active branch rows

## Throws

RxDBError when the ref row or the working tree state row is missing

## Remarks

The `entryCount` self-consistency is **not validated here**: that would require scanning the entry table, and the whole point of a summary is not to scan.
The invariant is left to [assertWorkingTreeEntryCountIntact](assertWorkingTreeEntryCountIntact.md), called by the conformance suite and the write paths.

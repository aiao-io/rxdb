# assertWorkingTreeEntryCountIntact()

```ts
function assertWorkingTreeEntryCountIntact(executor, branchId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L256)

Validates that the redundant column matches the actual entry row count (data-model.md §2.6).

## Parameters

| Parameter  | Type                                                                  | Description                       |
| ---------- | --------------------------------------------------------------------- | --------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's transaction executor |
| `branchId` | `string`                                                              | The branch to validate            |

## Returns

`Promise`&lt;`void`&gt;

## Throws

[WorkingTreeEntryCountMismatchError](../classes/WorkingTreeEntryCountMismatchError.md) when the two disagree (**throws in both directions**)

## Remarks

**Counts only this branch.** Without `branchId`, the neighboring branch's uncommitted entries blow up this branch's count, and the assertion starts raising false alarms on a perfectly healthy database — and an invariant assertion that false-alarms gets turned off quickly.

It throws in both directions: the redundant column being smaller than the row count is a second kind of truth too, its symptom being `status()` reporting clean while `commit()` commits a batch of units.

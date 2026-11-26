# readBranchEntries()

```ts
function readBranchEntries(executor, branchId): Promise<WorkingTreeEntry[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L253)

Reads all current uncommitted entries of a branch, ascending by `id`

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's transaction |
| `branchId` | `string` | Id of the branch to read |

## Returns

`Promise`&lt;`WorkingTreeEntry`[]&gt;

All uncommitted entries on that branch, ascending by `id`

## Remarks

**Ascending by `id`** rather than letting the backend order freely: `CommitChangeSet.sequence` is densely assigned in this order,
and the content fingerprint depends on this order. With the ordering unstable, the same batch of changes would compute two fingerprints on two backends,
and `assertCommitGraphIntact()` would judge one side's whole chain corrupted.

Same export reason as [readWorkingTreeStateRow](readWorkingTreeStateRow.md): `commit()` (`commit-command.ts`) and
the entry copying when creating branches (`commit/branch-commit-rows.ts`) read the **same batch of rows, in the same order**.
With one copy each, the day some place changes `orderBy`, the entry orderings copied by the two paths diverge — and the fingerprint depends on this
ordering, so on the day they diverge `assertCommitGraphIntact()` would judge one side's whole chain corrupted.

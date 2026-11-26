# readBranchEntries()

```ts
function readBranchEntries(executor, branchId): Promise<WorkingTreeEntry[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L253)

Reads a branch's current uncommitted entries, ascending by `id`

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's transaction |
| `branchId` | `string` | The id of the branch to read |

## Returns

`Promise`&lt;`WorkingTreeEntry`[]&gt;

All uncommitted entries on that branch, ascending by `id`

## Remarks

**Ascending by `id`** rather than letting the backend order freely: `CommitChangeSet.sequence` is issued
densely in this order, and the content fingerprint in turn consumes this order. With an unstable ordering,
the same batch of changes would compute two fingerprints on two backends, and `assertCommitGraphIntact()`
would judge one side's whole chain as corrupted.

Same export rationale as [readWorkingTreeStateRow](readWorkingTreeStateRow.md): `commit()` (`commit-command.ts`)
and the entry copying done when creating a branch (`commit/branch-commit-rows.ts`) read **the same rows in
the same order**. Written separately, the day one of them changes its `orderBy`, the two paths' copied entry
arrangements diverge — and the fingerprint consumes that arrangement, so on the day they diverge,
`assertCommitGraphIntact()` would judge one side's whole chain as corrupted.

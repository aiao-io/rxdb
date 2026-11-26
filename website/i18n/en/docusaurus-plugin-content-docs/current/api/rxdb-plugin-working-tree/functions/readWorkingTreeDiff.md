# readWorkingTreeDiff()

```ts
function readWorkingTreeDiff(
   executor, 
   branchId, 
   options?
): Promise<WorkingTreeDiff>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L272)

Unfolds a branch's `HEAD ↔ working tree` diff (FR-005).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's transaction; this function does not open its own transaction |
| `branchId` | `string` | The branch to unfold |
| `options?` | [`WorkingTreeDiffOptions`](../interfaces/WorkingTreeDiffOptions.md) | See [WorkingTreeDiffOptions](../interfaces/WorkingTreeDiffOptions.md) |

## Returns

`Promise`&lt;[`WorkingTreeDiff`](../interfaces/WorkingTreeDiff.md)&gt;

See [WorkingTreeDiff](../interfaces/WorkingTreeDiff.md)

## Throws

RxDBError when the working tree state row is missing, or when a pagination key is given at transaction
granularity (see assertPageableGranularity)

## Remarks

`branchId` is an explicit parameter rather than "read the active branch itself": the facade's `diff()` takes
zero parameters and only looks at the current branch, while the conformance suites and the restore path need
to unfold a specified branch. Folding the active-branch read in here would force the latter two to switch
branches first just to diff.

**Only the four keys in [WorkingTreeDiffOptions](../interfaces/WorkingTreeDiffOptions.md) are recognized**;
`options` is not spread wholesale into the query conditions: spread in, a caller's `{ from: 'commit-a' }`
would become a rule against a nonexistent `from` column, and stand-ins and real backends react differently to
that — some throw, some silently match nothing.

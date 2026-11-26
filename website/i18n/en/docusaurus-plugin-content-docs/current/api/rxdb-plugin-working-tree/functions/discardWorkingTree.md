# discardWorkingTree()

```ts
function discardWorkingTree(executor, options): Promise<WorkingTreeDiscardResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts#L108)

Resets the current branch's whole working tree back to the current HEAD (FR-016).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's write-transaction executor; this function does **not open its own transaction** |
| `options` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md) | See [WorkingTreeDiscardOptions](../type-aliases/WorkingTreeDiscardOptions.md); all three capture positions are required |

## Returns

`Promise`&lt;[`WorkingTreeDiscardResult`](../type-aliases/WorkingTreeDiscardResult.md)&gt;

See [WorkingTreeDiscardResult](../type-aliases/WorkingTreeDiscardResult.md)

## Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

## Throws

NoActiveBranchError when there are zero active branches

## Remarks

On a corrupted branch, **refuse first**: "the branch is broken anyway, cleaning it out is a favor" costs the user the uncommitted portion of their data at the only moment diagnostics can still be exported.

The no-op criterion uses the **actual entry row count** rather than the redundant `entryCount` column: if the two have already diverged, judging by the redundant column permanently strands a batch of real entries in the table (while `status()` reports clean), whereas judging by row count also converges the redundant column back to the real value. Actually discovering divergence is [assertWorkingTreeEntryCountIntact](assertWorkingTreeEntryCountIntact.md)'s job.

The restore session is cleared **together with the entries** (US-307 AC5): what was discarded is exactly everything that restore wrote into the working tree; leaving the session makes `status()` keep reporting `restoring` while the changes it points to are no longer in the database. discardActiveRestoreSession runs after the status row UPDATE, and only on the non-no-op path — point 2 above requires a clean discard to issue not a single write statement.

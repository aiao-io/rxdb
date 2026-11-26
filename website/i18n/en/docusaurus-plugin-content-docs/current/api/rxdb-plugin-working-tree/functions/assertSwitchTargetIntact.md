# assertSwitchTargetIntact()

```ts
function assertSwitchTargetIntact(executor, targetBranchId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L138)

Validates that the **target** branch's commit graph is fully reachable and intact (FR-051, SC-013).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's read-only transaction executor |
| `targetBranchId` | `string` | The id of the branch being switched to |

## Returns

`Promise`&lt;`void`&gt;

## Throws

[BranchNotMaterializedError](../classes/BranchNotMaterializedError.md) when the target has only metadata and no local commit graph yet

## Throws

CommitGraphCorruptedError when the target branch is already marked corrupted, or a mismatch exists on the reachable parent chain

## Remarks

**Check materialization state before talking about corruption.** A metadata-only remote branch (FR-044/049) has no ref, or a ref row with a null HEAD, and the corruption guard that cannot read a ref throws "the migration didn't create a row for it" — that diagnosis is wrong for a branch that **should have been materialized first**, and sends the user chasing migrations. With the check in front, it gets `branch_not_materialized`, a code with an actionable next step attached.

Reaching here means `takeOverBranchSwitch` did not take over this switch (this connection has no registered snapshot source, or the caller bypassed `rxdb.switchBranch()` and hit the adapter directly), so the cause is written as `source_unavailable` with `attemptId` of `null` — no attempt has even started.

The **entire** judgment delegates to assertCommitGraphIntact; this module repeats not a single literal: FR-051 requires "implemented as a shared guard, no second copy". A copy starts out field-for-field identical, until the day only the guard changes and not the copy — and on that day both sides' tests are still green.

It checks `targetBranchId`, not the current branch. The other three call sites (commit / restore / discard) all write `assertCommitGraphIntact(executor, token.branchId)`; copying them verbatim inverts the direction: switching into a corrupt branch sails through, switching away from one is rejected — and "switching away" is precisely one of the three things FR-051 explicitly permits.

Read-only. The corruption mark is written by `markBranchCorrupted()` in **another transaction**; writing it into this transaction, which is bound to roll back, makes the mark vanish with it and the user can never diagnose.

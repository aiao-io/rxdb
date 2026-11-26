# SKIP_BRANCH_SWITCH_PREPARE

```ts
const SKIP_BRANCH_SWITCH_PREPARE: SwitchBranchOptions["prepare"];
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L244)

Empty implementation that explicitly states "this call has no branch to validate".

## Remarks

**Only callsites that do not change the branch may use it.** `switchBranch` is at once the primitive for both "switch branches" and "batch-apply [SwitchVersionActions](../interfaces/SwitchVersionActions.md)"; history replay (undo/redo, invalidating the redo stack) needs only the latter, omitting [SwitchBranchOptions.branchId](../interfaces/SwitchBranchOptions.md#branchid) so the actions land on the current branch and the active branch does not move. With no branch switch, there is no "is the history of the branch being switched to replayable" to ask, and no generation to advance.

A callsite that does change the branch and uses it is effectively turning the guard off: the target branch's commit graph is not checked, the caller's conditions are not judged, the activation generation is not advanced — and the switch still completes. That is exactly the situation making [SwitchBranchOptions.prepare](../interfaces/SwitchBranchOptions.md#prepare) required is meant to prevent.

It is a named export rather than letting each callsite write its own `async () => {}`: this way "who is exempt from the precondition check" is a table countable with a single grep, while anonymous empty arrows could only be found by reading the full text.

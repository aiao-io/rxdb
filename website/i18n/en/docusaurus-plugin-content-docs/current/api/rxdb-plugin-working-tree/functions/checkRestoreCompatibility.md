# checkRestoreCompatibility()

```ts
function checkRestoreCompatibility(
   executor, 
   codec, 
   target
): Promise<RestoreCompatibility>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L297)

Judges whether "restoring the working tree to the target commit" is feasible on the current client.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The current transaction executor |
| `codec` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | The metadata resolution context, see [WorkingTreePatchCodecContext](../interfaces/WorkingTreePatchCodecContext.md) |
| `target` | [`WorkingTreeRestoreTarget`](../interfaces/WorkingTreeRestoreTarget.md) | The restore target, see [WorkingTreeRestoreTarget](../interfaces/WorkingTreeRestoreTarget.md) |

## Returns

`Promise`&lt;[`RestoreCompatibility`](../type-aliases/RestoreCompatibility.md)&gt;

See [RestoreCompatibility](../type-aliases/RestoreCompatibility.md)

## Throws

RxDBError when the target is not on the current branch HEAD's reachable parent chain

## Remarks

**This function writes not a single byte.** The word "check" is itself a read-only promise; writing a status row on the side would make it unsafe to reuse from entry points other than restore (such as the UI's "can this version be restored" preview), and that preview is exactly why this piece was split into its own function.

When the target is unreachable it **throws** rather than returning a failure exit: that is the caller's precondition. `restore-command.ts` first uses [selectRestoreReplayPath](selectRestoreReplayPath.md) to judge reachability and converts it into its own failure `reason`, so by the time execution reaches here "reachable" already holds; this throw only fires when someone skips that step, which is a code defect, not user input.

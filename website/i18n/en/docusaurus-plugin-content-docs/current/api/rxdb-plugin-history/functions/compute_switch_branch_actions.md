# compute_switch_branch_actions()

```ts
function compute_switch_branch_actions(readers, branchId, fromBranchId?): Promise<SwitchVersionActions<EntityType>>;
```

Defined in: [packages/rxdb-plugin-history/src/switch-branch-actions.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/switch-branch-actions.ts#L63)

**`Internal`**

Uses the given repositories to compute the writes for "switching from the current active branch to `branchId`" —
the body of switch\_branch\_actions.

## Parameters

| Parameter       | Type                                                                      | Description                                                                 |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `readers`       | [`SwitchBranchActionReaders`](../interfaces/SwitchBranchActionReaders.md) | See [SwitchBranchActionReaders](../interfaces/SwitchBranchActionReaders.md) |
| `branchId`      | `string`                                                                  | The id of the branch to switch to                                           |
| `fromBranchId?` | `string`                                                                  | The start branch; without it, the one active on the main checkout           |

## Returns

`Promise`&lt;[`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md)&gt;&gt;

The action sequence required to switch branches

## Remarks

Extracted for `@aiao/rxdb-plugin-working-tree`'s materialization barrier: the barrier must first retract the source branch's projection
and then lay down the target branch's snapshot, and it runs inside `switchBranch`'s `prepare` with only the transaction executor's repositories at hand —
the adapter-bound local repository would wait on the barrier's own transaction on the same connection, deadlocking. Writing a second synonymous computation
would eventually diverge from the ordinary switch over "do rollback markers count".

Callers whose start is not the main checkout's branch (US-314: an instance mounted on a writable checkout, whose data is the branch held by that table set) pass `fromBranchId`.

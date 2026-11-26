# assertSwitchBranchPreconditions()

```ts
function assertSwitchBranchPreconditions(executor, options?): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L85)

Verifies the preconditions **explicitly raised** by the caller (FR-017, FR-020).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's read-only transaction |
| `options?` | [`RxDBBranchSwitchPreconditions`](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md) | The preconditions raised by the caller; omitting it takes no position |

## Returns

`Promise`&lt;`void`&gt;

## Throws

[WorkingTreeDirtyError](../classes/WorkingTreeDirtyError.md) when `requireClean: true` and the current branch is not empty

## Throws

[StaleActiveBranchError](../classes/StaleActiveBranchError.md) when `expectedActivationRevision` does not match the database

## Remarks

**When no conditions are raised, not a single statement is issued.** Not "read and then ignore": that read would be added to the cost of every switch, and what comes back would sooner or later be used "while we're at it" — no test can stop that step.

`requireClean: false` and omitting it are the same thing. Conversely, treating "the field exists" as "check it" (`options.requireClean !== undefined` and the like) would make an explicit opt-out turn the check on.

The clean criterion reads only the `WorkingTreeState.entryCount` column, not a scan of the entries table: scanning both forfeits the constant time SC-001 requires and lets the criterion drift away from `status().clean` from then on — on the day they drift, the summary says clean while the switch says dirty, and the user has no way out.

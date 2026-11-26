# assertSwitchBranchPreconditions()

```ts
function assertSwitchBranchPreconditions(executor, options?): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L85)

Validates the preconditions the caller **explicitly stated** (FR-017, FR-020).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's read-only transaction executor |
| `options?` | [`RxDBBranchSwitchPreconditions`](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md) | The preconditions stated by the caller; not passing any states nothing |

## Returns

`Promise`&lt;`void`&gt;

## Throws

[WorkingTreeDirtyError](../classes/WorkingTreeDirtyError.md) when `requireClean: true` and the current branch is not empty

## Throws

[StaleActiveBranchError](../classes/StaleActiveBranchError.md) when `expectedActivationRevision` disagrees with the database

## Remarks

**Issues not a single statement when no condition is stated.** Not "read then ignore": that read would be added to the cost of every switch, and what is read back would eventually get used "as a convenience" — a step no test can guard against.

`requireClean: false` and not passing it are the same thing. Conversely treating "field present" as "check it" (`options.requireClean !== undefined` and the like) turns explicitly turning it off into turning the check on.

The clean criterion takes only the `WorkingTreeState.entryCount` column, not a scan of the entry table: scanning loses the constant time SC-001 requires and lets the criterion drift from `status().clean` — on the day it drifts, the summary says clean and the switch says dirty, leaving the user no way out.

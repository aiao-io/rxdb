# get_branch_max_change()

```ts
function get_branch_max_change(changeRepository, branchId): Promise<RxDBChange | undefined>;
```

Defined in: [packages/rxdb-plugin-history/src/switch-branch-actions.ts:389](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/switch-branch-actions.ts#L389)

**`Internal`**

Reads a branch's current tip: the largest-id change among its own un-reverted changes.

## Parameters

| Parameter          | Type                 | Description            |
| ------------------ | -------------------- | ---------------------- |
| `changeRepository` | `BranchChangeReader` | See BranchChangeReader |
| `branchId`         | `string`             | The branch id          |

## Returns

`Promise`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md) \| `undefined`&gt;

The tip change row; `undefined` when the branch has no own changes at all (the caller falls back to the fork point)

## Remarks

Exported for reuse by `enable-migration.ts`: the answer to "where does a branch currently sit" must be globally unique
(research.md R11). A second synonymous query written for the migration phase would eventually diverge from the switch path over "do rollback markers count"
or "which column is the sort key", surfacing as the migration allowing a branch that `switchBranch` cannot traverse.

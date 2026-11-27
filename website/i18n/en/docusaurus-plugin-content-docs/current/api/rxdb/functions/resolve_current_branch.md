# resolve_current_branch()

```ts
function resolve_current_branch(branchRepository, rxdb, tableSet?): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/system-repositories.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-repositories.ts#L48)

Resolves the "current branch": the branch held by the table set this instance is mounted on; activates `main` when the primary table set has no active branch, and creates one if `main` does not exist either.

## Parameters

| Parameter          | Type                                                                      | Default value           | Description                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branchRepository` | [`LocalRxDBBranchRepository`](../interfaces/LocalRxDBBranchRepository.md) | `undefined`             | The branch repository                                                                                                                                                  |
| `rxdb`             | [`RxDB`](../classes/RxDB.md)                                              | `undefined`             | The RxDB instance, used only for `worktreeTableSet` and `entityManager.instantiate`                                                                                    |
| `tableSet?`        | [`WorktreeTableSet`](../classes/WorktreeTableSet.md)                      | `rxdb.worktreeTableSet` | Which table set's held branch to read; defaults to the set this instance is mounted on. Only entities of the primary table set (QueryCache) pass the primary table set |

## Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

## Throws

[RxDBError](../classes/RxDBError.md) When it is mounted on a writable checkout and the branch held by that table set is already gone.

## Throws

[WorktreeBranchHeldError](../classes/WorktreeBranchHeldError.md) When the primary table set has no active branch and `main` is in the hands of a writable checkout.

## Remarks

It takes only a repository, not a manager: whichever transaction the passed-in repository belongs to is the transaction this logic runs in — the function itself makes no enqueueing decisions. The cold path of [getCurrentBranch](getCurrentBranch.md) and the plugin-side `create_branch` (which already holds a transaction open; going through `getCurrentBranch` again would re-enqueue via the repository bound to the adapter, queueing behind its own transaction — queue concurrency is 1, so it would hang forever) share it.

The lookup is the same caliber as [getCurrentBranch](getCurrentBranch.md), taking `WorktreeTableSet.heldBranchWhere` (US-314 B1.4): when mounted on a writable checkout, the parent branch obtained by creating a branch inside the transaction is the branch held by that table set, not the one activated on the primary checkout.

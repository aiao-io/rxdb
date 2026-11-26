# resolveSingleActiveBranch()

```ts
function resolveSingleActiveBranch(executor, host): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:351](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L351)

**For the first-enablement migration only**: reads the single active branch, and restores to `main` when there is none active.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The executor of the migration's transaction |
| `host` | [`ActiveBranchEntityHost`](../interfaces/ActiveBranchEntityHost.md) | Used to `instantiate` when a new `main` is needed |

## Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

The single active branch

## Throws

[AmbiguousActiveBranchError](../classes/AmbiguousActiveBranchError.md) when there are multiple active rows; **not a single row is changed**,
  the caller rolls back the whole migration

## Throws

[WorktreeBranchHeldError](../classes/WorktreeBranchHeldError.md) when there are no active rows and `main` is held by a writable checkout; likewise no row is changed

## Remarks

It takes one parameter more than [assertSingleActiveBranch](assertSingleActiveBranch.md), and that parameter is the entire difference of "whether it can repair":
without `instantiate` no branch can be created. This is not a matter of style — one more parameter means one more path of "fixing it on the way",
while FR-048 confines the restore semantics **to the first migration**.

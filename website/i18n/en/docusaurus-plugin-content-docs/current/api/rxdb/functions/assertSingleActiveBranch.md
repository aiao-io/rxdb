# assertSingleActiveBranch()

```ts
function assertSingleActiveBranch(executor): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:372](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L372)

Runtime validation: there must be **exactly** one active row; fixes nothing.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The executor of the caller's transaction |

## Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

The single active branch

## Throws

[NoActiveBranchError](../classes/NoActiveBranchError.md) when there is no active row — even when `main` is in the library

## Throws

[AmbiguousActiveBranchError](../classes/AmbiguousActiveBranchError.md) when there are multiple active rows

## Remarks

The signature deliberately has no means of creating a branch: it **cannot obtain** `instantiate`, so the shortcut of "activating `main` on the way"
is blocked at the type level.

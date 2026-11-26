# assertUsableBranchId()

```ts
function assertUsableBranchId(branchId): void;
```

Defined in: [packages/rxdb/src/system/active-branch-guard.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/active-branch-guard.ts#L112)

Validates that a branch id is usable; throws when it is not.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | The branch id to validate |

## Returns

`void`

## Throws

[InvalidBranchIdError](../classes/InvalidBranchIdError.md) when the id is empty / pure whitespace / contains the reserved character `*`

## Remarks

It lives in the **same file** as the sentinel constant because it fulfills exactly the promise made by the TSDoc on
[ACTIVE\_BRANCH\_KEY](../variables/ACTIVE_BRANCH_KEY.md). Moving it next to a call site like `version/create-branch.ts` would hide this rule from whoever changes the sentinel's shape —
and that is precisely the only moment when a synchronized change is needed.

The validation point is the **creation and import boundary**, not every read and write: once an id lands in the database it never changes, and re-validating on the read path
would only turn "bad data left over from history" into "the whole library cannot be opened". Bad ids already lying in the database are covered by the
cardinality invariant in [assertSingleActiveBranch](assertSingleActiveBranch.md).

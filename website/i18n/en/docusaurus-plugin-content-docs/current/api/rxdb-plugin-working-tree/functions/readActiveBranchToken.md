# readActiveBranchToken()

```ts
function readActiveBranchToken(executor): Promise<ActiveBranchToken>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L176)

Reads this instance's current branch token: the branch held by the table set it is mounted on

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's transaction executor |

## Returns

`Promise`&lt;[`ActiveBranchToken`](../interfaces/ActiveBranchToken.md)&gt;

The branch id and activation revision

## Throws

NoActiveBranchError when the main table set has zero active branches

## Throws

AmbiguousActiveBranchError when the main table set has multiple active branches

## Throws

RxDBError when mounted on a writable checkout and the branch held by that table set is gone

## Remarks

The two fields come from two tables, but must be read in the **same transaction**: reading separately lets a switch branch interleave, leaving a token whose branch id belongs to the old branch and revision to the new one — a state that never existed.

The main table set still goes through the "exactly one active" guard; mounted on a writable checkout (US-314 B1.4) it reads that one row by the held key (`WorktreeTableSet.heldBranchWhere`). A missing held branch means the checkout is already closed, and it must not fall back to the main checkout's branch: that would record this table set's writes into another branch's working tree.

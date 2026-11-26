# write_new_branch()

```ts
function write_new_branch(
   rxdb, 
   executor, 
   input
): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L44)

**`Internal`**

Writes a new branch inside the caller's transaction: the branch row, plus the rows of each system contributor.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The host; its entity manager and system contributors are taken from it |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The executor of the caller's write transaction |
| `input` | [`NewBranchRowInput`](../interfaces/NewBranchRowInput.md) | See [NewBranchRowInput](../interfaces/NewBranchRowInput.md) |

## Returns

`Promise`&lt;[`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)&gt;

The branch row just written

## Remarks

Split out of create\_branch's transaction body so the working tree plugin's "create branch from commit" (US-314) can reuse it: that path must pass
capability gates inside its own managed transaction, and the fork point comes from the position recorded by that commit — a `(parent branch, null)` "stopped at the parent branch's own fork point"
position cannot be expressed by `createBranch(id, fromChangeId)`'s inputs. Duplicate checks and parent resolution are left to the caller: the two paths
validate in different orders, and folding them in here would force both sides to accommodate the other's order.

The branch row is written before the contributor rows; contributors are called serially and an error aborts, see create\_branch for the rationale.

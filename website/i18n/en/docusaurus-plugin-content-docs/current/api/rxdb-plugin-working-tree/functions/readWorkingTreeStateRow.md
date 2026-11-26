# readWorkingTreeStateRow()

```ts
function readWorkingTreeStateRow(executor, branchId): Promise<WorkingTreeState>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L219)

Reads this branch's working tree state row.

## Parameters

| Parameter  | Type                                                                  | Description                       |
| ---------- | --------------------------------------------------------------------- | --------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The caller's transaction executor |
| `branchId` | `string`                                                              | The target branch id              |

## Returns

`Promise`&lt;`WorkingTreeState`&gt;

That branch's state row

## Throws

RxDBError when the state row is missing

## Remarks

The state row's primary key is **character-for-character identical** to the branch id (`commit/branch-commit-rows.ts`), so this reads by primary key rather than scanning a foreign-key column. A missing row **throws**, no backfill: a backfilled `workingTreeRevision = 0` sends another tab's CAS basis silently back to the start, and commit's concurrency arbitration depends entirely on it.

It is exported rather than kept in this module because `status()` / `commit()` / `discard()` read the **same row**: if each wrote its own "read by primary key, throw on missing", one place someday changing to "missing counts as 0" gives the working tree revision two readings, while CAS concurrency arbitration is built on all callers reading the same value.

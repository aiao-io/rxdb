# readCurrentBranchId()

```ts
function readCurrentBranchId(tx, tableSet): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/with\_triggers\_disabled.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts#L38)

Reads the current branch id (activated first, otherwise main), for rebuilding triggers.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tx` | [`SqlExecutor`](../type-aliases/SqlExecutor.md) | The executor of the current transaction |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set this instance is mounted on: when mounted on a writable checkout, reads the branch held by that table set (US-314 B1.4) |

## Returns

`Promise`&lt;`string`&gt;

The currently active branch id

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) Thrown when metadata is missing columns or no branch can be read, so the transaction rolls back

## Remarks

**Cannot** go through `versionManager.getCurrentBranch()`:
under C2, repository reads and writes going through the real adapter re-enqueue (concurrency 1). When `pullRepository` calls
`executor.mergeChanges(..., disableTriggers=true)` inside an outer `adapter.transaction`,
the queue slot is still occupied by the outer transaction; re-enqueueing a branch read queues behind itself and hangs forever.
Here the SQL is issued directly through the current transaction executor.

The judgment itself lives in `read_current_branch_id.ts`; this function only flattens the result shape of `execute`
(wrapped in `results[0]`) into the flat shape that one wants: when the two were written separately, the deletion with the `?? 'id'` fallback
landed in only one of them.

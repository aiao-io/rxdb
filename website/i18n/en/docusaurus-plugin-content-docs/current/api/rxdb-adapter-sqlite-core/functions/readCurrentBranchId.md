# readCurrentBranchId()

```ts
function readCurrentBranchId(tx, tableSet): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/with\_triggers\_disabled.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts#L38)

Reads the current branch id (activated takes precedence, otherwise main), for rebuilding triggers.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tx` | [`SqlExecutor`](../type-aliases/SqlExecutor.md) | Executor of the current transaction |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set this instance is mounted on: when mounted on a writable checkout, it reads the branch held by that table set (US-314 B1.4) |

## Returns

`Promise`&lt;`string`&gt;

The current active branch id

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when the metadata is missing columns or no branch can be read at all, causing the transaction to roll back

## Remarks

It must **not** go through `versionManager.getCurrentBranch()`:
under C2, repository reads and writes through the real adapter enqueue again (concurrency 1). When `pullRepository` calls
`executor.mergeChanges(..., disableTriggers=true)` inside an outer `adapter.transaction`,
the queue slot is still held by the outer transaction; enqueueing again to read the branch queues behind itself and hangs forever.
Here SQL is issued directly through the current transaction's executor.

The judgment itself lives in `read_current_branch_id.ts`; this function only flattens the shape of `execute`'s result
(wrapped in `results[0]`) into the flat shape that one wants: when the two were written separately, the `?? 'id'` fallback
deletion only landed in one of them.

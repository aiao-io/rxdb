# readWorkingTreeActivationState()

```ts
function readWorkingTreeActivationState(executor): Promise<WorkingTreeActivationInfo>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L127)

Reads the activation state: `activationRevision` comes from the row of the table set this instance is mounted on, `branchGenerationSeq` from the primary checkout's row.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The current transaction executor |

## Returns

`Promise`&lt;[`WorkingTreeActivationInfo`](../interfaces/WorkingTreeActivationInfo.md)&gt;

The activation state view

## Throws

RxDBError when the activation state row is missing

## Remarks

Filters by the **constant primary key**, not `find()`'s first row: on a single-row table "the first row" is always right, until some bug writes a second row, and by then the revision has already started drifting.

A missing row **throws** — it does not return 0, nor **self-heal by backfilling**. Returning 0 would merge "this row is gone" and "this database was just created" into the same answer, and the cost only shows up in US-308 — the CAS compares against a fabricated 0, and hit or miss no longer means anything. Self-healing is worse: it permanently buries the fact that `0004` never finished, and the backfilled `branchGenerationSeq = 0` would make the next new branch collide with an existing branch.

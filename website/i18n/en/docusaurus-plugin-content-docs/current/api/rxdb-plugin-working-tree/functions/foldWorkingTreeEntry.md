# foldWorkingTreeEntry()

```ts
function foldWorkingTreeEntry(existing, write): FoldOutcome;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L236)

Folds one capture into the existing working tree unit.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `existing` | \| [`WorkingTreeEntryRow`](../interfaces/WorkingTreeEntryRow.md) \| `undefined` | The entity's existing uncommitted unit; pass `undefined` when there is none |
| `write` | [`CapturedWrite`](../interfaces/CapturedWrite.md) | The write captured this time |

## Returns

[`FoldOutcome`](../type-aliases/FoldOutcome.md)

Create row / update row / delete row, and how `entryCount` should move

## Remarks

**Pure function**: mutates neither `existing` nor `write`; folding the same input twice yields the same result. The caller persists `entry` directly, and adds `entryCountDelta` into `rxdb_working_tree_state.entryCount` — **this must happen in the same transaction**, otherwise the redundant column and the row count part ways after a crash.

Four rules:

1. `patch` takes the latest composed value, `inversePatch` keeps the first captured value.
2. `INSERT` followed by `DELETE` (the row does not exist at HEAD) → net no change: delete the entry and decrement the count, **without** leaving a `delete` unit. If one were left, commit would carry a record of "deleting a row that does not exist at HEAD", and replay would either error or skip it silently.
3. `origin` takes the source of the latest write; `remote_sync` is **not** exempt from folding — it still creates units and still counts.
4. **No value-level zeroing**: changing an UPDATE back to HEAD's original value does not dissolve into no unit, nor does it dissolve when `patch` and `inversePatch` are exactly equal. Whether to delete is for HEAD to decide, and these two patches are only a local record. This is a known trade-off (see the file overview), not an omission.

## Example

```ts
const outcome = foldWorkingTreeEntry(existingRow, capturedWrite);
if (outcome.kind === 'remove') await entries.delete(key);
else await entries.put(key, outcome.entry);
state.entryCount += outcome.entryCountDelta;
```

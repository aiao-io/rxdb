# foldWorkingTreeEntry()

```ts
function foldWorkingTreeEntry(existing, write): FoldOutcome;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L236)

Folds one capture into the existing working tree unit

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `existing` | \| [`WorkingTreeEntryRow`](../interfaces/WorkingTreeEntryRow.md) \| `undefined` | The entity's existing uncommitted unit; pass `undefined` when there is none |
| `write` | [`CapturedWrite`](../interfaces/CapturedWrite.md) | The write captured this time |

## Returns

[`FoldOutcome`](../type-aliases/FoldOutcome.md)

Create row / update row / delete row, and how `entryCount` should move

## Remarks

**Pure function**: it does not mutate `existing` or `write`; folding the same inputs twice yields the same result. The caller persists the returned `entry` directly and accumulates `entryCountDelta` into `rxdb_working_tree_state.entryCount` — **this must happen in the same transaction**, otherwise a crash splits the redundant column from the row count forever.

Four rules:

1. `patch` takes the latest composed value, `inversePatch` keeps the first captured value.
2. `INSERT` followed by `DELETE` (the row does not exist at HEAD) → net no change, delete the entry and decrement the count, and do **not** leave a `delete` unit. Leaving one would make commit carry a record of "deleting a row that never existed at HEAD", which either errors or silently skips on replay.
3. `origin` takes the latest write's origin; `remote_sync` is **not** exempt from folding — it creates a unit and counts just the same.
4. **No value-level zeroing**: changing an UPDATE back to HEAD's original value does not dissolve into no unit, nor does it dissolve when `patch` and `inversePatch` are exactly equal. Whether to delete is HEAD's call, and the two patches are only local records. This is a known trade-off (see fileoverview), not an oversight.

## Example

```ts
const outcome = foldWorkingTreeEntry(existingRow, capturedWrite);
if (outcome.kind === 'remove') await entries.delete(key);
else await entries.put(key, outcome.entry);
state.entryCount += outcome.entryCountDelta;
```

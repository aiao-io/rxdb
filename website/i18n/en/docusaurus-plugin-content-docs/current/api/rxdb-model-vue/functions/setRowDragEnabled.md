# setRowDragEnabled()

```ts
function setRowDragEnabled(table, enabled): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:68

Toggles the table's row drag handles at runtime

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | Target table instance (`rowSeriesNumber.dragOrder` must be enabled when creating the table) |
| `enabled` | `boolean` | When `false`, no rows show a handle |

## Returns

`void`

## Remarks

Cells are rebuilt only when the state actually changes; the handle collapsing depends on `patchDragIconForReadonlyRows` having been applied.

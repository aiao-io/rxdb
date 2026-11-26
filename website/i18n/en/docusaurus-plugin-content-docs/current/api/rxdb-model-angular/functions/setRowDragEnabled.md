# setRowDragEnabled()

```ts
function setRowDragEnabled(table, enabled): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:68

Toggles the table's row drag handles at runtime

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance (the table must have been created with `rowSeriesNumber.dragOrder` enabled) |
| `enabled` | `boolean` | When `false`, no row shows its handle |

## Returns

`void`

## Remarks

Cells are rebuilt only when the state actually changes; collapsing the handles depends on the `patchDragIconForReadonlyRows` patch already having been applied.

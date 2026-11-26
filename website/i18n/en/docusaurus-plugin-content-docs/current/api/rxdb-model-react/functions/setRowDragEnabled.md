# setRowDragEnabled()

```ts
function setRowDragEnabled(table, enabled): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:68

Toggles the table's row drag handle at runtime

## Parameters

| Parameter | Type           | Description                                                                                 |
| --------- | -------------- | ------------------------------------------------------------------------------------------- |
| `table`   | `ListTableAll` | Target table instance (`rowSeriesNumber.dragOrder` must be enabled when creating the table) |
| `enabled` | `boolean`      | When `false`, no row shows the handle                                                       |

## Returns

`void`

## Remarks

Cells are only rebuilt when the state actually changes; collapsing the handle relies on `patchDragIconForReadonlyRows` having already been patched.

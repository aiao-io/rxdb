# setRowDragEnabled()

```ts
function setRowDragEnabled(table, enabled): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L87)

Toggles the table's row drag handle at runtime

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | Target table instance (`rowSeriesNumber.dragOrder` must be enabled at table creation) |
| `enabled` | `boolean` | When `false`, no row shows the handle |

## Returns

`void`

## Remarks

Rebuilds cells only when the state actually changes; collapsing the handle relies on the patch already applied by `patchDragIconForReadonlyRows`.

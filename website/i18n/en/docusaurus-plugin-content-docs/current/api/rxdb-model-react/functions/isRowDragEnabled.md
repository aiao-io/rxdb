# isRowDragEnabled()

```ts
function isRowDragEnabled(table): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:75

Whether row dragging is currently allowed on the table

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | Target table instance |

## Returns

`boolean`

`true` when [setRowDragEnabled](setRowDragEnabled.md) has not been called

# isRowDragEnabled()

```ts
function isRowDragEnabled(table): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:75

Whether the table currently allows row dragging

## Parameters

| Parameter | Type           | Description               |
| --------- | -------------- | ------------------------- |
| `table`   | `ListTableAll` | The target table instance |

## Returns

`boolean`

`true` when [setRowDragEnabled](setRowDragEnabled.md) has never been called

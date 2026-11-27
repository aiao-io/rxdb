# isRowDragEnabled()

```ts
function isRowDragEnabled(table): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L100)

Whether the table currently allows row dragging

## Parameters

| Parameter | Type           | Description           |
| --------- | -------------- | --------------------- |
| `table`   | `ListTableAll` | Target table instance |

## Returns

`boolean`

`true` when [setRowDragEnabled](setRowDragEnabled.md) has never been called

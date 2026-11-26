# readRowMove()

```ts
function readRowMove(table, idField, change): RowMoveEvent | null;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L66)

Reads the dragged row and drop-point neighbors from a single row drag-drop

## Parameters

| Parameter | Type                                                            | Description                                                                                            |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `table`   | `ListTableAll`                                                  | Table instance after the reorder (VTable runs `changeRecordOrder` first and then dispatches the event) |
| `idField` | `string`                                                        | Record primary key field name                                                                          |
| `change`  | [`HeaderPositionChange`](../interfaces/HeaderPositionChange.md) | Event payload of `change_header_position`                                                              |

## Returns

[`RowMoveEvent`](../interfaces/RowMoveEvent.md) \| `null`

`null` when a column was dragged, it was dropped in place, or the dragged row's primary key is not a string

## Example

```typescript
table.on('change_header_position', args => {
  const move = readRowMove(table, 'id', args);
  if (move) emitRowMoved(move);
});
```

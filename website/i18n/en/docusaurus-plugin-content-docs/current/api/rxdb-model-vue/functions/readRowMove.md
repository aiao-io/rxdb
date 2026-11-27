# readRowMove()

```ts
function readRowMove(table, idField, change): RowMoveEvent | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:58

Reads the dragged row and its landing neighbor from one row drag and drop

## Parameters

| Parameter | Type                                                            | Description                                                                                                               |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `table`   | `ListTableAll`                                                  | The table instance after the reorder has been applied (VTable calls `changeRecordOrder` first, then dispatches the event) |
| `idField` | `string`                                                        | The record's primary key field name                                                                                       |
| `change`  | [`HeaderPositionChange`](../interfaces/HeaderPositionChange.md) | The event arguments of `change_header_position`                                                                           |

## Returns

[`RowMoveEvent`](../interfaces/RowMoveEvent.md) \| `null`

`null` when a column was dragged, the row was dropped in place, or the dragged row's primary key is not a string

## Example

```typescript
table.on('change_header_position', args => {
  const move = readRowMove(table, 'id', args);
  if (move) emitRowMoved(move);
});
```

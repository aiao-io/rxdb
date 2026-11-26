# restoreTableRecords()

```ts
function restoreTableRecords(
   table, 
   records, 
   committed
): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:87

Restores the table rows to the order of the most recent commit

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The record array given to the table (it is mutated back in place) |
| `committed` | readonly [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The order snapshot recorded at the most recent `setRecords` call |

## Returns

`void`

## Remarks

VTable's drag and drop reorder splices the passed-in array in place, so the record array handed over is already in the dragged order;
therefore the host component must keep a separate copy every time it hands over data, and use it to revert the array and redraw on failure or rejection.

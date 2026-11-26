# restoreTableRecords()

```ts
function restoreTableRecords(
   table, 
   records, 
   committed
): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L115)

Restores the table rows to the order of the most recent commit.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The record array handed to the table (will be modified back in place) |
| `committed` | readonly [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The order copy recorded at the most recent `setRecords` |

## Returns

`void`

## Remarks

VTable drag-and-drop reordering splices the passed-in array in place, so the record array handed over is already in the dragged order by then;
therefore the host component must keep a separate copy each time it hands data over, and use it to restore the array before repainting when the move fails or is rejected.

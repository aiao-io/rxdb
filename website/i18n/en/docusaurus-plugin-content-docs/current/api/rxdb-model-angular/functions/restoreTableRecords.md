# restoreTableRecords()

```ts
function restoreTableRecords(table, records, committed): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:87

Restores the table rows to the most recently committed order

## Parameters

| Parameter   | Type                                                                 | Description                                                              |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `table`     | `ListTableAll`                                                       | The target table instance                                                |
| `records`   | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[]          | The record array handed to the table (it will be modified back in place) |
| `committed` | readonly [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The order snapshot recorded at the most recent `setRecords` call         |

## Returns

`void`

## Remarks

VTable's drag-and-drop reorder performs an in-place `splice` on the passed-in array, so the record array handed in is already in the dragged order at this point;
the host component must therefore keep an extra copy each time it hands data over, and use it to change the array back and repaint on failure or rejection.

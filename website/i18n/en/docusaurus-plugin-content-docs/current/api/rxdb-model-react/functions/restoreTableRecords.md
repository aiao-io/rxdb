# restoreTableRecords()

```ts
function restoreTableRecords(table, records, committed): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:87

Restores the table rows to the most recently committed order

## Parameters

| Parameter   | Type                                                                 | Description                                                              |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `table`     | `ListTableAll`                                                       | Target table instance                                                    |
| `records`   | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[]          | The record array that was given to the table (will be restored in place) |
| `committed` | readonly [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The order snapshot recorded at the most recent `setRecords`              |

## Returns

`void`

## Remarks

VTable's drag-and-drop reorder splices the passed array in place, so the record array handed in is already in the post-drag order by then;
the host component must therefore keep a separate copy each time it passes data, and use it to restore the array and repaint on failure or rejection.

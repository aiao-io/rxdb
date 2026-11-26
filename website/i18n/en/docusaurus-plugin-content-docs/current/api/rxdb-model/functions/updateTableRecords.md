# updateTableRecords()

```ts
function updateTableRecords(
   table, 
   records, 
   prevColumns, 
   newColumns
): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L100)

Updates the table data and restores column widths (matched by field name, tolerating column additions/removals).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The updated row data |
| `prevColumns` | `ColumnsDefine` \| `undefined` | The column definitions before the update, used to read the old column widths |
| `newColumns` | `ColumnsDefine` \| `undefined` | The updated column definitions |

## Returns

`void`

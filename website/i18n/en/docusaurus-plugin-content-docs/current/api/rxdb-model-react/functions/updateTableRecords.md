# updateTableRecords()

```ts
function updateTableRecords(table, records, prevColumns, newColumns): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:60

Updates table data and restores column widths (matched by field name, tolerant of added/removed columns)

## Parameters

| Parameter     | Type                                                        | Description                                                              |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `table`       | `ListTableAll`                                              | Target table instance                                                    |
| `records`     | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The updated row data                                                     |
| `prevColumns` | `ColumnsDefine` \| `undefined`                              | The column definitions before the update, used to read old column widths |
| `newColumns`  | `ColumnsDefine` \| `undefined`                              | The updated column definitions                                           |

## Returns

`void`

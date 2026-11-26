# changeCellValue()

```ts
function changeCellValue(table, col, row, value): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts#L79)

Writes back a cell value (without triggering edit events)

## Parameters

| Parameter | Type           | Description           |
| --------- | -------------- | --------------------- |
| `table`   | `ListTableAll` | Target table instance |
| `col`     | `number`       | Column index          |
| `row`     | `number`       | Row index             |
| `value`   | `unknown`      | Value to write        |

## Returns

`void`

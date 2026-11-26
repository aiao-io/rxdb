# changeCellValue()

```ts
function changeCellValue(table, col, row, value): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/vtable-compat.d.ts:51

Writes a cell value back (without triggering edit events)

## Parameters

| Parameter | Type           | Description               |
| --------- | -------------- | ------------------------- |
| `table`   | `ListTableAll` | The target table instance |
| `col`     | `number`       | Column index              |
| `row`     | `number`       | Row index                 |
| `value`   | `unknown`      | The value to write        |

## Returns

`void`

# applySystemText()

```ts
function applySystemText(table, text, columns?): PendingWrite[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:58

Collects pending write operations from system clipboard text (TSV).
Boolean columns automatically convert text to booleans (true/1/yes → true, false/0/no/empty → false),
unrecognized values are skipped; enum columns skip values not in menuList; when there are not enough rows/columns the values wrap around.
Skips readonly rows, new rows and non-writable columns (column-level readonly, system / selection / action columns).

## Parameters

| Parameter  | Type                                           | Description                                                                                                                   |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `table`    | `ListTableAll`                                 | The target table instance                                                                                                     |
| `text`     | `string`                                       | The system clipboard text (TSV format, split into rows by \n and columns by \t)                                               |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | The column definition list (optional), used to read the column property type, enum options and the column-level readonly flag |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

The list of pending write operations

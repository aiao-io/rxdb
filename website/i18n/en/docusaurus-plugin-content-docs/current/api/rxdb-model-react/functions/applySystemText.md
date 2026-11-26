# applySystemText()

```ts
function applySystemText(table, text, columns?): PendingWrite[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:58

Collects pending write operations from system clipboard text (TSV).
Boolean columns automatically convert text to booleans (true/1/yes → true, false/0/no/empty → false),
skipping unrecognized values; enum columns skip values not in menuList; when there are not enough rows/columns, values are reused cyclically.
Skips read-only rows, newly created rows, and non-writable columns (column-level read-only, system / selection / action columns).

## Parameters

| Parameter  | Type                                           | Description                                                                                                               |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `table`    | `ListTableAll`                                 | Target table instance                                                                                                     |
| `text`     | `string`                                       | The system clipboard text (TSV format, split into rows by \n and columns by \t)                                           |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | List of column definitions (optional), used to read column property types, enum options, and column-level read-only flags |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

List of pending write operations

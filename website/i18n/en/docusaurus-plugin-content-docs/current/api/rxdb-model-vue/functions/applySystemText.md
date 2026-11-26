# applySystemText()

```ts
function applySystemText(
   table, 
   text, 
   columns?
): PendingWrite[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:58

Collects pending write operations from system clipboard text (TSV).
Boolean columns automatically convert text to booleans (true/1/yes and their localized equivalents → true, false/0/no/empty → false),
unrecognizable values are skipped; enum columns skip values not in menuList; rows/columns are reused cyclically when there are not enough.
Skips readonly rows, new rows and non-writable columns (column-level readonly, system / selection / action columns).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `text` | `string` | System clipboard text (TSV format, rows split by \n, columns by \t) |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | List of column definitions (optional), used to read column property types, enum options and column-level readonly flags |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

List of pending write operations

# applyClipboard()

```ts
function applyClipboard(
   table, 
   clipboard, 
   columns?
): PendingWrite[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:46

Collects pending write operations from the internal clipboard (matched by column position, Excel-like behavior).
The cellType must match; when there are not enough rows/columns, values are reused cyclically.
Skips read-only rows, newly created rows, and non-writable columns (column-level read-only, system / selection / action columns);
if the target column defines a menuList, values outside the enum range are skipped.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | Target table instance |
| `clipboard` | [`ClipboardContent`](../type-aliases/ClipboardContent.md) | The internal clipboard content |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | List of column definitions (optional), used to read column property types, enum options, and column-level read-only flags |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

List of pending write operations

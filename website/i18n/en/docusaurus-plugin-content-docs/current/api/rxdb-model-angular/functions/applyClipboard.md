# applyClipboard()

```ts
function applyClipboard(table, clipboard, columns?): PendingWrite[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:46

Collects pending write operations from the internal clipboard (matched by column position, Excel-like behavior).
The cellType must match; when there are not enough rows/columns the values wrap around.
Skips readonly rows, new rows and non-writable columns (column-level readonly, system / selection / action columns);
if the target column defines a menuList, values outside the enum range are skipped.

## Parameters

| Parameter   | Type                                                      | Description                                                                                                                   |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `table`     | `ListTableAll`                                            | The target table instance                                                                                                     |
| `clipboard` | [`ClipboardContent`](../type-aliases/ClipboardContent.md) | The internal clipboard content                                                                                                |
| `columns?`  | readonly `Record`&lt;`string`, `unknown`&gt;[]            | The column definition list (optional), used to read the column property type, enum options and the column-level readonly flag |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

The list of pending write operations

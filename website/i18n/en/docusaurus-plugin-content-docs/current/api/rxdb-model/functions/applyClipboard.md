# applyClipboard()

```ts
function applyClipboard(table, clipboard, columns?): PendingWrite[];
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L242)

Collects pending writes from the internal clipboard (matched by column position, Excel-like behavior).
The cellType must match; when rows/columns run short the values cycle and reuse.
Skips read-only rows, new rows, and non-writable columns (column-level read-only, system / selection / actions columns);
if the target column defines a menuList, values outside the enum range are skipped.

## Parameters

| Parameter   | Type                                                      | Description                                                                                                               |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `table`     | `ListTableAll`                                            | The target table instance                                                                                                 |
| `clipboard` | [`ClipboardContent`](../type-aliases/ClipboardContent.md) | The internal clipboard content                                                                                            |
| `columns?`  | readonly `Record`&lt;`string`, `unknown`&gt;[]            | The column definition list (optional), used to read column property types, enum options, and column-level read-only flags |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

The list of pending writes

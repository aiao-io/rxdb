# snapshotSelection()

```ts
function snapshotSelection(table, columns?): ClipboardContent | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:27

Snapshots the current VTable selection as clipboard content.

Skips: the header row, readonly rows, new rows, and meta-field columns (`_` prefix).

## Parameters

| Parameter  | Type                                           | Description                                                                   |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `table`    | `ListTableAll`                                 | The target table instance                                                     |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | The column definition list (optional), used to read the column property types |

## Returns

[`ClipboardContent`](../type-aliases/ClipboardContent.md) \| `null`

The clipboard snapshot; returns null when there are no copyable cells

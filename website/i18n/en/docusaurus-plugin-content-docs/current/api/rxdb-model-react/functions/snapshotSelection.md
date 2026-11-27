# snapshotSelection()

```ts
function snapshotSelection(table, columns?): ClipboardContent | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:27

Snapshots the current VTable selection into clipboard content.

Skips: header rows, read-only rows, new rows, and metadata field columns (`_` prefix).

## Parameters

| Parameter  | Type                                           | Description                                                     |
| ---------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `table`    | `ListTableAll`                                 | The target table instance                                       |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | Optional column definitions, used to read column property types |

## Returns

[`ClipboardContent`](../type-aliases/ClipboardContent.md) \| `null`

The clipboard snapshot; returns null when there are no copyable cells

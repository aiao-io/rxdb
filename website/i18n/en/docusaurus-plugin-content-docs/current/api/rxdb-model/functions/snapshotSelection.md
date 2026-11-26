# snapshotSelection()

```ts
function snapshotSelection(table, columns?): ClipboardContent | null;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L186)

Snapshots the current VTable selection into clipboard content.

Skips: header rows, read-only rows, new rows, and meta-field columns (with a `_` prefix).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | The column definition list (optional), used to read column property types |

## Returns

[`ClipboardContent`](../type-aliases/ClipboardContent.md) \| `null`

The clipboard snapshot; returns null when there are no copyable cells

# applySystemText()

```ts
function applySystemText(
   table, 
   text, 
   columns?
): PendingWrite[];
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L296)

Collects pending writes from system clipboard text (TSV).
Boolean columns automatically convert text to booleans (true/1/yes or its localized form → true, false/0/no or its localized form/empty → false),
unrecognizable values are skipped; enum columns skip values not in menuList; when rows/columns run short the values cycle and reuse.
Skips read-only rows, new rows, and non-writable columns (column-level read-only, system / selection / actions columns).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `text` | `string` | System clipboard text (TSV format, rows split by \n and columns by \t) |
| `columns?` | readonly `Record`&lt;`string`, `unknown`&gt;[] | The column definition list (optional), used to read column property types, enum options, and column-level read-only flags |

## Returns

[`PendingWrite`](../interfaces/PendingWrite.md)[]

The list of pending writes

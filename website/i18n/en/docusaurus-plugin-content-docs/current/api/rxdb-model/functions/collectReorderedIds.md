# collectReorderedIds()

```ts
function collectReorderedIds(table, idField): string[];
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L79)

Collects the list of non-read-only row IDs after drag-and-drop reordering.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `idField` | `string` | The record ID field name |

## Returns

`string`[]

The non-read-only row IDs in the current row order

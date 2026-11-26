# collectReorderedIds()

```ts
function collectReorderedIds(table, idField): string[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:51

Collects the IDs of non-read-only rows after drag reordering

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `idField` | `string` | The name of the record ID field |

## Returns

`string`[]

The IDs of non-read-only rows in the current row order

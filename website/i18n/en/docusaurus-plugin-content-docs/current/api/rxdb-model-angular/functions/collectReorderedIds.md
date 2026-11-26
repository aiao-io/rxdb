# collectReorderedIds()

```ts
function collectReorderedIds(table, idField): string[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:51

Collects the IDs of non-readonly rows after drag-and-drop reordering.

## Parameters

| Parameter | Type           | Description                     |
| --------- | -------------- | ------------------------------- |
| `table`   | `ListTableAll` | The target table instance       |
| `idField` | `string`       | The name of the record ID field |

## Returns

`string`[]

The non-readonly row IDs in the current row order

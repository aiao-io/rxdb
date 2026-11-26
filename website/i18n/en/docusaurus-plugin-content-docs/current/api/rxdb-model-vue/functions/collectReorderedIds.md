# collectReorderedIds()

```ts
function collectReorderedIds(table, idField): string[];
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:51

Collects the ID list of non-readonly rows after drag ordering

## Parameters

| Parameter | Type           | Description               |
| --------- | -------------- | ------------------------- |
| `table`   | `ListTableAll` | The target table instance |
| `idField` | `string`       | Record ID field name      |

## Returns

`string`[]

The non-readonly row IDs in the current row order

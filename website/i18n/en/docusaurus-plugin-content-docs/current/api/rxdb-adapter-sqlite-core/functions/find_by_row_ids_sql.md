# find_by_row_ids_sql()

```ts
function find_by_row_ids_sql(metadata, tableSet, rowIds): GenerateSqlResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/find\_by\_row\_ids\_sql.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/find_by_row_ids_sql.ts#L9)

Generates the findByRowIds query

## Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  |
| `rowIds`   | `bigint`[]                                                    |

## Returns

[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)

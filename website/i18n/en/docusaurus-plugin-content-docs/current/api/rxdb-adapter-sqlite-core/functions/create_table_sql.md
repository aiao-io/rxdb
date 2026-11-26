# create_table_sql()

```ts
function create_table_sql(adapter, metadata, tableSet): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table/create\_table\_sql.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table/create_table_sql.ts#L328)

Computes the sql for creating a table

## Parameters

| Parameter  | Type                                                           | Description                             |
| ---------- | -------------------------------------------------------------- | --------------------------------------- |
| `adapter`  | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | The adapter instance                    |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)  | Entity metadata                         |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)   | Which business table set to create into |

## Returns

`string`

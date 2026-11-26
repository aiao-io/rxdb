# generate_tree_sql()

```ts
function generate_tree_sql(
   adapter, 
   metadata, 
   options
): GenerateSqlResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_tree\_sql.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts#L88)

Generates a tree query

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `options` | `TreeOptions` |

## Returns

[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)

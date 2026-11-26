# generate_entity_find_descendants_sql()

```ts
function generate_entity_find_descendants_sql(
   adapter, 
   metadata, 
   options
): GenerateSqlResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_tree\_sql.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts#L186)

Queries descendant nodes

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md) |

## Returns

[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)

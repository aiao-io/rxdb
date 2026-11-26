# find_sql()

```ts
function find_sql(
   adapter, 
   metadata, 
   options
): GenerateSqlResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/find\_sql.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts#L13)

Generates the find query

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md), `object`&gt; |

## Returns

[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)

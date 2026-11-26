# count_sql()

```ts
function count_sql(adapter, metadata, options): GenerateSqlResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/count\_sql.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/count_sql.ts#L14)

Generates a count query

## Parameters

| Parameter  | Type                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `adapter`  | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)                                                                 |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)                                                                  |
| `options`  | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md), `object`&gt; |

## Returns

[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)

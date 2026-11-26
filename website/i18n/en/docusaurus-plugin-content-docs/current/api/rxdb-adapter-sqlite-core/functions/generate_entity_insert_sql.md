# generate_entity_insert_sql()

```ts
function generate_entity_insert_sql<T>(
   metadata, 
   tableSet, 
   entity, 
   context?
): Promise<GenerateSqlResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/insert\_sql.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts#L59)

Generates the SQL statement for creating an entity

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) |
| `entity` | `InstanceType`&lt;`T`&gt; |
| `context?` | [`InsertSqlOptions`](../interfaces/InsertSqlOptions.md) |

## Returns

`Promise`&lt;[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)&gt;

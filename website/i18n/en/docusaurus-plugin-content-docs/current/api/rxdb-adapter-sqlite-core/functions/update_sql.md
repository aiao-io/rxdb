# update_sql()

```ts
function update_sql<T>(
   metadata, 
   tableSet, 
   entityOrEntities, 
   patch, 
   context?
): Promise<GenerateSqlResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/update\_sql.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/update_sql.ts#L14)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) |
| `entityOrEntities` | `InstanceType`&lt;`T`&gt; \| `InstanceType`&lt;`T`&gt;[] |
| `patch` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; |
| `context?` | [`IMutationContext`](../../rxdb/interfaces/IMutationContext.md) & `object` |

## Returns

`Promise`&lt;[`GenerateSqlResult`](../interfaces/GenerateSqlResult.md)&gt;

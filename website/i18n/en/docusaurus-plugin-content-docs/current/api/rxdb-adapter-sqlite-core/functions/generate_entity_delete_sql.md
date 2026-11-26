# generate_entity_delete_sql()

```ts
function generate_entity_delete_sql<T>(
   metadata, 
   tableSet, 
   entity
): object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/delete\_sql.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/delete_sql.ts#L8)

Generates the SQL statement for deleting an entity

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

## Returns

`object`

### params

```ts
params: any[];
```

### sql

```ts
sql: string;
```

# generate_entity_deletes_sql()

```ts
function generate_entity_deletes_sql<T>(
   metadata, 
   tableSet, 
   entities
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/deletes\_sql.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/deletes_sql.ts#L8)

Generates SQL statements for bulk-deleting entities

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

## Returns

`string`

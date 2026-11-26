# get_relation_key()

```ts
function get_relation_key(
   relations, 
   joinTableName, 
   relation
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L68)

Gets the relation key

## Parameters

| Parameter | Type |
| ------ | ------ |
| `relations` | [`RelationPair`](../interfaces/RelationPair.md)[] |
| `joinTableName` | `string` |
| `relation` | [`EntityRelationMetadata`](../../rxdb/type-aliases/EntityRelationMetadata.md) |

## Returns

`string`

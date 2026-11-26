# try_resolve_relation_path()

```ts
function try_resolve_relation_path(
   adapter, 
   entityMetadata, 
   parts, 
   cut
): object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L56)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `parts` | `string`[] |
| `cut` | `number` |

## Returns

`object`

### metaWalker?

```ts
metaWalker?: Readonly<EntityMetadataType>;
```

### relPairs

```ts
relPairs: RelationPair[];
```

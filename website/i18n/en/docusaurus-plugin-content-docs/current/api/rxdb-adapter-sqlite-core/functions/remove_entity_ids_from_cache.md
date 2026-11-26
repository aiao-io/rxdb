# remove_entity_ids_from_cache()

```ts
function remove_entity_ids_from_cache<T>(
   adapter, 
   EntityType, 
   ids
): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction\_sqlite\_result.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction_sqlite_result.ts#L188)

Removes deleted entities from the cache (by id) and marks their state as removed.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `EntityType` | `T` |
| `ids` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt;[] |

## Returns

`void`

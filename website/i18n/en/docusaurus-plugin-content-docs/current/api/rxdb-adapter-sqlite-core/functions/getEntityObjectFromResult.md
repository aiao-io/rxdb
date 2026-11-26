# getEntityObjectFromResult()

```ts
function getEntityObjectFromResult<T>(
   metadata, 
   columns, 
   rows, 
   opts?
): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:644](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L644)

Creates an entity object from query result rows.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` | [`EntityData`](../../rxdb/type-aliases/EntityData.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `columns` | `string`[] | Column name array |
| `rows` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] | Row data array |
| `opts?` | [`EncryptionContext`](../interfaces/EncryptionContext.md) | - |

## Returns

`Promise`&lt;`T`&gt;

The entity object, keyed by JS property names

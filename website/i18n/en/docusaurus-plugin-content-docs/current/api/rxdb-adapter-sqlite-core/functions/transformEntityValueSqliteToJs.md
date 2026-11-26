# transformEntityValueSqliteToJs()

```ts
function transformEntityValueSqliteToJs<T>(metadata, entity): T;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:780](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L780)

Converts a SQLite entity value to a JS object value

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` | [`EntityData`](../../rxdb/type-aliases/EntityData.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `entity` | [`EntityData`](../../rxdb/type-aliases/EntityData.md) | The entity object, keyed by database column name |

## Returns

`T`

The transformed entity object, keyed by JS property name

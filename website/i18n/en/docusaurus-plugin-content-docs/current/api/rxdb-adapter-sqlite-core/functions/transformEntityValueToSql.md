# transformEntityValueToSql()

```ts
function transformEntityValueToSql(metadata, entity, opts?): Promise<SQLiteEntityData>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L374)

Converts an entity value to SQLite format.

## Parameters

| Parameter  | Type                                                                 | Description                                                                                                                     |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)        | Entity metadata                                                                                                                 |
| `entity`   | [`EntityData`](../../rxdb/type-aliases/EntityData.md)                | The entity object                                                                                                               |
| `opts?`    | [`EncryptionContext`](../interfaces/EncryptionContext.md) & `object` | Optional encryption context; when it contains a keyring, columns with `property.encrypted === true` are encrypted automatically |

## Returns

`Promise`&lt;`SQLiteEntityData`&gt;

The converted entity object, keyed by database column names

## Remarks

Only two kinds of keys are accepted: real foreign keys (property names from `foreignKeyNames` or physical column names from `foreignKeyColumnNames`), and declared properties (property names or physical column names). All other keys are ignored, including ones ending in `Id`.

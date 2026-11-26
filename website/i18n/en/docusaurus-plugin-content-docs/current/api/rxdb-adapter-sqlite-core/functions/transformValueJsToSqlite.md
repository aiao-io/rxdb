# transformValueJsToSqlite()

```ts
function transformValueJsToSqlite(value, property): SQLiteCompatibleType | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L166)

Converts a JS-typed value to a SQLite-compatible type

## Parameters

| Parameter  | Type                                                                                                                                                                  | Description       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `value`    | `unknown`                                                                                                                                                             | The JS value      |
| `property` | \| [`EntityPropertyMetadata`](../../rxdb/type-aliases/EntityPropertyMetadata.md) \| [`KeyValuePropertyMetadata`](../../rxdb/type-aliases/KeyValuePropertyMetadata.md) | Property metadata |

## Returns

\| [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)
\| `undefined`

The SQLite-compatible value

# transformValueSqliteToJs()

```ts
function transformValueSqliteToJs(value, property): unknown;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L231)

Converts a SQLite-typed value to a JS type

## Parameters

| Parameter  | Type                                                                                                                                                                  | Description              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `value`    | `unknown`                                                                                                                                                             | The SQLite-typed value   |
| `property` | \| [`EntityPropertyMetadata`](../../rxdb/type-aliases/EntityPropertyMetadata.md) \| [`KeyValuePropertyMetadata`](../../rxdb/type-aliases/KeyValuePropertyMetadata.md) | Entity property metadata |

## Returns

`unknown`

The JS-typed value

# rxDBColumnTypeToSqliteType()

```ts
function rxDBColumnTypeToSqliteType(property): SqliteDataType;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L127)

Converts an RxDB property type to a SQLite data type

## Parameters

| Parameter | Type |
| ------ | ------ |
| `property` | \{ `encrypted?`: `boolean`; `type`: `string`; \} |
| `property.encrypted?` | `boolean` |
| `property.type` | `string` |

## Returns

[`SqliteDataType`](../type-aliases/SqliteDataType.md)

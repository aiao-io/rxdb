# UpdateHookCallback

```ts
type UpdateHookCallback = (type, dbName, tableName, rowId) => void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L32)

SQLite update_hook notification callback

## Parameters

| Parameter   | Type                                                      |
| ----------- | --------------------------------------------------------- |
| `type`      | [`SQLiteChangeType`](../enumerations/SQLiteChangeType.md) |
| `dbName`    | `string`                                                  |
| `tableName` | `string`                                                  |
| `rowId`     | `bigint`                                                  |

## Returns

`void`

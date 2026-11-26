# getRxDBChangeEventType()

```ts
function getRxDBChangeEventType(eventType): "INSERT" | "DELETE" | "UPDATE";
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L33)

Maps a SQLite change type to an RxDB change event string

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `eventType` | [`SQLiteChangeType`](../enumerations/SQLiteChangeType.md) | The SQLite change type enum value |

## Returns

`"INSERT"` \| `"DELETE"` \| `"UPDATE"`

The change event string

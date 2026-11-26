# isDesktopSqliteFileStorage()

```ts
function isDesktopSqliteFileStorage(value): value is DesktopSqliteFileStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:55

Checks whether a storage configuration has the SQLite single-file shape.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | Arbitrary value, usually from an unvalidated configuration or IPC input |

## Returns

`value is DesktopSqliteFileStorage`

`true` when it is a SQLite single-file storage

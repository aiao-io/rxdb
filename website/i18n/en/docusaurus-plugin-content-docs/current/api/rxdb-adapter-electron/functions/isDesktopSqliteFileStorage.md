# isDesktopSqliteFileStorage()

```ts
function isDesktopSqliteFileStorage(value): value is DesktopSqliteFileStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:55

Checks whether a storage configuration has the single-file SQLite shape.

## Parameters

| Parameter | Type      | Description                                                          |
| --------- | --------- | -------------------------------------------------------------------- |
| `value`   | `unknown` | Arbitrary value, usually from unvalidated configuration or IPC input |

## Returns

`value is DesktopSqliteFileStorage`

`true` when the value is single-file SQLite storage

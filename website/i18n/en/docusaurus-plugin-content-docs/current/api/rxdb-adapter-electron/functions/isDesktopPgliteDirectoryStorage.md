# isDesktopPgliteDirectoryStorage()

```ts
function isDesktopPgliteDirectoryStorage(value): value is DesktopPgliteDirectoryStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:62

Checks whether a storage configuration has the PGlite data directory shape.

## Parameters

| Parameter | Type      | Description                                                          |
| --------- | --------- | -------------------------------------------------------------------- |
| `value`   | `unknown` | Arbitrary value, usually from unvalidated configuration or IPC input |

## Returns

`value is DesktopPgliteDirectoryStorage`

`true` when the value is PGlite data directory storage

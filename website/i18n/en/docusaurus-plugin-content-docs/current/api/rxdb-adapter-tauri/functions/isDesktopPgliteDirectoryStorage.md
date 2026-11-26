# isDesktopPgliteDirectoryStorage()

```ts
function isDesktopPgliteDirectoryStorage(value): value is DesktopPgliteDirectoryStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:62

Checks whether a storage configuration has the PGlite data directory shape.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | Arbitrary value, usually from an unvalidated configuration or IPC input |

## Returns

`value is DesktopPgliteDirectoryStorage`

`true` when it is a PGlite data directory storage

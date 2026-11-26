# assertDesktopSqliteStorage()

```ts
function assertDesktopSqliteStorage(storage): asserts storage is DesktopSqliteFileStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:81

Validates that the storage configuration really is the only engine this protocol carries — SQLite single file.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `storage` | [`DesktopStorage`](../type-aliases/DesktopStorage.md) | Storage configuration |

## Returns

`asserts storage is DesktopSqliteFileStorage`

## Remarks

When the engine is wrong it throws immediately, **never falls back** to memory/OPFS/IndexedDB, and
never silently switches engines: the user must be able to trust that the data really went into the
backend they specified (AC#4).

There is no "runtime" dimension in the criteria: the adapter registration name already pins the
runtime (`sqlite-electron` / `sqlite-tauri`), and any caller that gets here can **only** be the
SQLite row — passing a `runtime` along would just be the caller introducing itself, and nothing it
reports changes the conclusion. PGlite will be carried by US-208's own `pglite-electron` path, which
is unrelated to this function.

The type layer has already converged once (`DesktopSqliteClient.connect` only accepts
[DesktopSqliteFileStorage](../interfaces/DesktopSqliteFileStorage.md)); validation still happens here because JavaScript
callers can bypass the types, and the host side reuses this function when parsing IPC input.

## Throws

Throws `unsupported_runtime_engine` when the engine is unsupported; throws `invalid_database_name` when the name is invalid

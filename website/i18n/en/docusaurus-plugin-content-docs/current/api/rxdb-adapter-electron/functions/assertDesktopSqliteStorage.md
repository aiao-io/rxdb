# assertDesktopSqliteStorage()

```ts
function assertDesktopSqliteStorage(storage): asserts storage is DesktopSqliteFileStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:81

Validates that the storage configuration is exactly the one engine this protocol carries — single-file SQLite.

## Parameters

| Parameter | Type                                                  | Description           |
| --------- | ----------------------------------------------------- | --------------------- |
| `storage` | [`DesktopStorage`](../type-aliases/DesktopStorage.md) | Storage configuration |

## Returns

`asserts storage is DesktopSqliteFileStorage`

## Remarks

A wrong engine throws immediately — **no fallback** to memory/OPFS/IndexedDB, and no silent engine switch:
the user must be able to be certain the data really went into the backend they specified (AC#4).

The criterion has no "runtime" dimension: the adapter registry name already pins the runtime (`sqlite-electron` /
`sqlite-tauri`), so a caller that reaches this point **can only** be the SQLite line; passing a `runtime`
in merely lets the caller identify itself — and whatever it reports changes nothing. PGlite will be carried
by its own path, US-208's `pglite-electron`, unrelated to this function.

The type layer already converged once (`DesktopSqliteClient.connect` only accepts [DesktopSqliteFileStorage](../interfaces/DesktopSqliteFileStorage.md)),
and this still re-validates because JavaScript callers can bypass types, and the host side also reuses this function when parsing IPC input.

## Throws

throws `unsupported_runtime_engine` when the engine is unsupported; throws `invalid_database_name` when the name is invalid

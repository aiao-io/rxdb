# rxdb-adapter-sqlite

The official SQLite adapter for `@aiao/rxdb`, built on the official SQLite WASM build, providing the SQLite storage backend for the core engine.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-sqlite rxjs
```

## Usage

```typescript
import { createSqliteClient, RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite';
```

- `createSqliteClient`: creates the SQLite client
- `RxDBAdapterSqlite`: the adapter implementation that plugs into `@aiao/rxdb`
- `sqliteLoad` / `resetSqliteLoadCache`: WASM loading and cache control
- Types: `SqliteOptions`, `SqliteLoadOptions`, `SqliteRepositoryConstructor`, etc.

The shared adapter kernel (table name resolution, rule compilation, the base Repository) comes from [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core/README.md).

## Backup and restore

`backup()` / `restore()` / `cleanupIncompleteRestore()` are provided by [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core/README.md); see there for semantics and error codes.

| Configuration                        | Backup / restore                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `opfs` off                           | ✅ in-memory database                                                                                                                       |
| `opfs: true`                         | ✅ OPFS, persistent `journal_mode` of `delete`                                                                                              |
| `opfs: true, opfsFallback: 'memory'` | ❌ `unsupported_combination` (`opfsFallback`): silently falls back to memory when OPFS cannot be opened, so the restore target is uncertain |

When running in a Worker, each connection leases an independent child port of the Worker: restore writes the database with one connection, and the later `connect()` opens another one on the same Worker.
The same `workerInstance` is only lent to one connection at a time: a second concurrent connection throws `Worker transport already has an active SQLite client`.
When calling `createSqliteClient` directly, `await client.disconnect()` first, then call
`releaseComlinkProxy(client)` exported by `@aiao/rxdb-adapter-sqlite-core` to return the child port, before reconnecting on the same Worker; the adapter already does this step automatically inside `disconnect()`.

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the adapter and storage backend guides

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Classes

| Class                                                       | Description                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| [RxDBAdapterSqlite](classes/RxDBAdapterSqlite.md)           | RxDB local storage adapter based on the official `@sqlite.org/sqlite-wasm`. |
| [RxDBAdapterSqliteError](classes/RxDBAdapterSqliteError.md) | Error class for the RxDB SQLite adapter                                     |
| [SqliteClient](classes/SqliteClient.md)                     | The oo1 client of the official sqlite-wasm.                                 |
| [SqliteRepository](classes/SqliteRepository.md)             | Entity repository operations                                                |

## Interfaces

| Interface                                                    | Description                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [GenerateSqlResult](interfaces/GenerateSqlResult.md)         | SQL generation result: the complete SQL statement and optional parameter bindings. |
| [RxDBAdapterSqliteBase](interfaces/RxDBAdapterSqliteBase.md) | Backend-agnostic SQLite adapter base class.                                        |
| [SqliteOfficialOptions](interfaces/SqliteOfficialOptions.md) | Full options for the official sqlite-wasm adapter.                                 |

## Type Aliases

| Type Alias                                                                                 | Description                                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [SqliteLoadOptions](type-aliases/SqliteLoadOptions.md)                                     | Runtime options accepted by `sqliteLoad`, excluding worker and repository configuration. |
| [SqliteOfficialRepositoryConstructor](type-aliases/SqliteOfficialRepositoryConstructor.md) | Constructor signature for custom Repository classes.                                     |

## Variables

| Variable                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BATCH\_TIMEOUT](variables/BATCH_TIMEOUT.md)                              | Change event batching timeout tiers (milliseconds). Shorter means lower latency but more frequent CPU wakeups; longer saves power but delays UI response. - `IMMEDIATE` (0): synchronous dispatch, only for test scenarios - `FAST` (4): merged within about one frame - `BALANCED` (16): the default, about one frame (60fps) - `POWER_SAVE` (50): mobile / background scenarios |
| [buildRuleGroup](variables/buildRuleGroup.md)                             | Generates the SQL query condition for a ruleGroup                                                                                                                                                                                                                                                                                                                                 |
| [ROWID](variables/ROWID.md)                                               | SQLite row id column name                                                                                                                                                                                                                                                                                                                                                         |
| [sqliteGetTableName](variables/sqliteGetTableName.md)                     | Builds the physical name of a main table set: `<namespace>$<logical name>`.                                                                                                                                                                                                                                                                                                       |
| [sqliteGetTableNameByMetadata](variables/sqliteGetTableNameByMetadata.md) | Physical table name of an entity within a given table set.                                                                                                                                                                                                                                                                                                                        |

## Functions

| Function                                                  | Description                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [createSqliteClient](functions/createSqliteClient.md)     | Creates and initializes the official sqlite-wasm client.                                      |
| [resetSqliteLoadCache](functions/resetSqliteLoadCache.md) | Clears the official sqlite-wasm module cache; for tests that need isolated module state only. |
| [sqliteLoad](functions/sqliteLoad.md)                     | Loads and caches the official sqlite-wasm oo1 module.                                         |

## References

### resetSqliteOfficialLoadCache \{#resetsqliteofficialloadcache\}

Renames and re-exports [resetSqliteLoadCache](functions/resetSqliteLoadCache.md)

---

### RxDBAdapterSqliteOfficial \{#rxdbadaptersqliteofficial\}

Renames and re-exports [RxDBAdapterSqlite](classes/RxDBAdapterSqlite.md)

---

### SqliteOfficialClient \{#sqliteofficialclient\}

Renames and re-exports [SqliteClient](classes/SqliteClient.md)

---

### sqliteOfficialLoad \{#sqliteofficialload\}

Renames and re-exports [sqliteLoad](functions/sqliteLoad.md)

---

### SqliteOfficialLoadOptions \{#sqliteofficialloadoptions\}

Renames and re-exports [SqliteLoadOptions](type-aliases/SqliteLoadOptions.md)

---

### SqliteOptions \{#sqliteoptions\}

Renames and re-exports [SqliteOfficialOptions](interfaces/SqliteOfficialOptions.md)

---

### SqliteRepositoryConstructor \{#sqliterepositoryconstructor\}

Renames and re-exports [SqliteOfficialRepositoryConstructor](type-aliases/SqliteOfficialRepositoryConstructor.md)

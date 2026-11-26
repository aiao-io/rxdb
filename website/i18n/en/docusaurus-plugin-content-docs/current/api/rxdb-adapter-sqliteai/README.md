# rxdb-adapter-sqliteai

The [sqliteai](https://github.com/sqliteai) storage adapter for `@aiao/rxdb`, providing a SQLite backend based on the sqliteai runtime for the core engine.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-sqliteai rxjs
```

## Usage

```typescript
import { createSqliteClient, RxDBAdapterSqliteai, sqliteaiLoad } from '@aiao/rxdb-adapter-sqliteai';
```

- `RxDBAdapterSqliteai`: the adapter implementation plugged into `@aiao/rxdb`
- `createSqliteClient` / `SqliteaiClient`: the sqliteai client
- `sqliteaiLoad`: runtime loading
- Types: `SqliteaiOptions`

The adapter's shared kernel (table name resolution, rule compilation, base
Repository) comes from [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core/README.md).

## Backup and restore

`backup()` / `restore()` / `cleanupIncompleteRestore()` are provided by
[`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core/README.md); see
there for semantics and error codes.

| Configuration                        | Backup / restore                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Without `opfs`                       | ✅ In-memory database                                                                                                                             |
| `opfs: true`                         | ✅ OPFS, persistent, `journal_mode` is `delete`                                                                                                   |
| `opfs: true, opfsFallback: 'memory'` | ❌ `unsupported_combination` (`opfsFallback`): silently falls back to memory when OPFS cannot be opened, leaving the restore target indeterminate |

The built-in vector and memory extensions create their own tables on every new
connection (`_sqliteai_vector`, `dbmem_*` and their FTS5 shadow tables, some
with initial rows). These tables together with their initial rows are what an
"empty database" looks like: restore only treats a target that exactly equals a
freshly created empty database as empty, and user data written into these
tables travels back and forth with the archive.

When running in a Worker, each connection rents an independent sub-port of the
Worker: restore uses one connection to write the database, and the subsequent
`connect()` opens another on the same Worker. One `workerInstance` is lent to
only one connection at a time: a second concurrent connection throws
`Worker transport already has an active SQLite client`. When calling
`createSqliteClient` directly, `await client.disconnect()` first, then call
`releaseComlinkProxy(client)` exported by `@aiao/rxdb-adapter-sqlite-core` to
return the sub-port before reconnecting on the same Worker; the adapter already
does this step automatically inside `disconnect()`.

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- Adapter and storage backend guides live on the project documentation site

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Classes

| Class                                                       | Description                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| [RxDBAdapterSqliteai](classes/RxDBAdapterSqliteai.md)       | The RxDB local storage adapter based on `@sqliteai/sqlite-wasm`. |
| [RxDBAdapterSqliteError](classes/RxDBAdapterSqliteError.md) | RxDB SQLite adapter error class                                  |
| [SqliteaiClient](classes/SqliteaiClient.md)                 | The oo1 client implementation for SqliteAI.                      |
| [SqliteRepository](classes/SqliteRepository.md)             | The repository for operating on entities                         |

## Interfaces

| Interface                                            | Description                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [GenerateSqlResult](interfaces/GenerateSqlResult.md) | SQL generation result: the complete SQL statement and optional parameter bindings.        |
| [SqliteaiOptions](interfaces/SqliteaiOptions.md)     | The complete SqliteAI adapter options (including an optional custom Repository registry). |

## Type Aliases

| Type Alias                                                                     | Description                                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [SqliteaiLoadOptions](type-aliases/SqliteaiLoadOptions.md)                     | The runtime option subset accepted by `sqliteaiLoad` (with worker / repository configuration stripped).              |
| [SqliteaiRepositoryConstructor](type-aliases/SqliteaiRepositoryConstructor.md) | The constructor signature of a custom Repository class (users can override the default Repository / TreeRepository). |

## Variables

| Variable                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BATCH\_TIMEOUT](variables/BATCH_TIMEOUT.md)                              | Change event batching timeout tiers (milliseconds). The shorter the lower latency but the more frequent CPU wakeups; the longer the more power saved but the later UI responses. - `IMMEDIATE` (0): synchronous dispatch, only for test scenarios - `FAST` (4): coalesced within about one frame - `BALANCED` (16): default, about one frame (60fps) - `POWER_SAVE` (50): mobile / background scenarios |
| [buildRuleGroup](variables/buildRuleGroup.md)                             | Generates the ruleGroup SQL query condition                                                                                                                                                                                                                                                                                                                                                             |
| [ROWID](variables/ROWID.md)                                               | The sqlite row id column name                                                                                                                                                                                                                                                                                                                                                                           |
| [sqliteGetTableName](variables/sqliteGetTableName.md)                     | Composes the physical name of the main table set: `<namespace>$<logical name>`.                                                                                                                                                                                                                                                                                                                         |
| [sqliteGetTableNameByMetadata](variables/sqliteGetTableNameByMetadata.md) | The physical table name of an entity in a given table set.                                                                                                                                                                                                                                                                                                                                              |

## Functions

| Function                                              | Description                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| [createSqliteClient](functions/createSqliteClient.md) | Creates a SqliteAI client instance and completes initialization. |
| [sqliteaiLoad](functions/sqliteaiLoad.md)             | Loads the SqliteAI WASM module (with module-level caching).      |

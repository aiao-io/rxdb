# rxdb-adapter-wa-sqlite

RxDB adapter that runs SQLite in the browser via wa-sqlite.

## Features

- **Local-first**: runs full SQLite in the browser via WebAssembly
- **Zero server**: no backend server needed; data is stored locally
- **SQLite compatible**: supports standard SQLite syntax and features
- **Reactive**: data changes automatically trigger updates
- **High performance**: uses Web Workers to avoid blocking the main thread

## When to use

- When you need a lightweight local database (small WASM footprint)
- When you need SQLite ecosystem compatibility
- When you need FTS5 full-text search
- Applications sensitive to startup speed and memory usage

## Comparison with other adapters

| Feature          | wa-sqlite                          | sqlite-wasm      | PGlite     |
| ---------------- | ---------------------------------- | ---------------- | ---------- |
| Database engine  | SQLite                             | SQLite           | PostgreSQL |
| WASM size        | ~500KB                             | ~800KB           | ~3MB       |
| Full-text search | FTS5                               | FTS5             | tsvector   |
| VFS options      | Multiple (IDB/OPFS)                | Standard         | Fixed      |
| Maturity         | Stable adapter, tiered VFS support | Official support | Newer      |

## Installation

```bash
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
# or
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

## Usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'app',
  context: { userId: 'current-user' },
  entities: [],
  sync: {
    local: { adapter: 'wa-sqlite' },
    type: SyncType.None
  }
});

rxdb.adapter(
  'wa-sqlite',
  db =>
    new RxDBAdapterWaSqlite(db, {
      vfs: 'IDBBatchAtomicVFS',
      async: true,
      wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
    })
);

await rxdb.connect('wa-sqlite');
```

## VFS options

These VFS implementations come from wa-sqlite's `src/examples/*`; upstream does not declare them a stable production API. This package only ships
`IDBBatchAtomicVFS` as the default, supported production backend; the other implementations must be explicitly selected after being evaluated against the table below.

| VFS                   | Support level | Constraints                                                                                                 |
| --------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `IDBBatchAtomicVFS`   | Production    | Default option; IndexedDB persistence, covers atomic writes and multi-connection regressions                |
| `MemoryVFS`           | Test only     | Sync, non-persistent                                                                                        |
| `MemoryAsyncVFS`      | Test only     | asyncify, non-persistent                                                                                    |
| `IDBMirrorVFS`        | Experimental  | IndexedDB mirror implementation; persistence regressions must be re-run before upgrading                    |
| `AccessHandlePoolVFS` | Experimental  | dedicated Worker only; depends on the OPFS sync access handle                                               |
| `OPFSAdaptiveVFS`     | Experimental  | dedicated Worker only                                                                                       |
| `OPFSAnyContextVFS`   | Experimental  | Supports Window, dedicated Worker, SharedWorker; only recommended for read-only or near-read-only workloads |
| `OPFSCoopSyncVFS`     | Experimental  | dedicated Worker only; does not require SharedArrayBuffer                                                   |
| `OPFSWriteAheadVFS`   | Experimental  | dedicated Worker only; recovery and concurrency behavior must be re-validated before upgrading              |

`worker` must be provided together with `workerInstance`, and `sharedWorker` must be provided together with `sharedWorkerInstance`;
the two transports are mutually exclusive. Workers/SharedWorkers are created and owned by the caller; the adapter never calls `terminate()` on the caller's behalf.

Place one `WaSqliteClient` in a SharedWorker and `expose` it on every connected port, and multiple tabs share that one connection: transactions are queued per database name under a cross-tab
Web Lock (`navigator.locks`), and a transaction left behind by a tab that dies mid-transaction is rolled back by the next tab that acquires the lock; when one tab disconnects it only returns its own share,
and the database is closed only when the last one disconnects — after which it can be connected again (`WaSqliteClient.release(owner)`).

```typescript
const worker = new Worker(new URL('./wa-sqlite.worker.js', import.meta.url), { type: 'module' });

new RxDBAdapterWaSqlite(db, {
  vfs: 'OPFSCoopSyncVFS',
  async: false,
  worker: true,
  workerInstance: worker,
  wasmPath: '/wa-sqlite/wa-sqlite.wasm'
});
```

The exported `WA_SQLITE_VFS_LIST` is a deeply frozen capability table and cannot be used as a custom VFS registration entry point.

## wa-sqlite supply chain

The npm registry does not carry the wa-sqlite build this package needs, so the dependency is pinned to the upstream immutable commit
`2bf1c59d89eb6497535a4217bc62fec68a0bb994` (upstream `v1.1.2` release; its `package.json`
still writes `1.1.1` in the `version` field — upstream never bumped it along with the tag), and `pnpm-lock.yaml` pins the archive SHA-512 as well.
`pnpm audit:wa-sqlite` verifies all direct consumers, the commit URL and the lockfile integrity; when upgrading the commit you must
re-audit the internal paths and capability matrix of the 9 VFS implementations in `src/examples/*`.

## Backup and restore

`backup()` / `restore()` / `cleanupIncompleteRestore()` are provided by [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core/README.md); see there for the semantics and error codes.

| VFS                            | Backup / restore                                     |
| ------------------------------ | ---------------------------------------------------- |
| `MemoryVFS` / `MemoryAsyncVFS` | ✅ in-memory database                                |
| `IDBBatchAtomicVFS`            | ✅ IndexedDB, persisted with `journal_mode` `delete` |
| Other VFS                      | ❌ `unsupported_combination` (`vfs`)                 |

The combinations in the table are only delivered for main-thread connections: when `worker` / `workerInstance` or `sharedWorker` / `sharedWorkerInstance` is set, all three entry points report `unsupported_combination` (`transport`, with `actual` `worker` or `sharedWorker`) and do not touch the output stream or the archive source.

The precompiled wasm of the npm `wa-sqlite` is not built with FTS5, so there are no FTS5 virtual tables in the library; archives containing `fts5` virtual tables (from other builds) are rejected before being written.

## Full example

See the integration example in [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular).

## Fileoverview

Entry point of the `@aiao/rxdb-adapter-wa-sqlite` package.

Browser-side wa-sqlite (nicolo-ribaudo/wa-sqlite) adapter; also serves as the **baseline implementation** of the sqlite-wasm
adapter — both inherit from the same `RxDBAdapterSqliteBase` and are derived through different
`createSqliteClient` / VFS loading logic.

Entry layering:

- core shared types and functions (re-exported from `@aiao/rxdb-adapter-sqlite-core`)
- the wa-sqlite adapter body `RxDBAdapterWaSqlite` (also exported under the alias `RxDBAdapterSqlite`, so sqlite-wasm / wa-sqlite share code paths)
- the client `WaSqliteClient`, responsible for the SQLite connection, change interception and batch dispatch
- the loading utility `waSqliteLoad`: lazily loads the `wa-sqlite`/wasm artifacts selected by VFS

## Classes

| Class                                                       | Description                            |
| ----------------------------------------------------------- | -------------------------------------- |
| [RxDBAdapterSqlite](classes/RxDBAdapterSqlite.md)           | Browser wa-sqlite adapter.             |
| [RxDBAdapterSqliteError](classes/RxDBAdapterSqliteError.md) | Error class of the RxDB SQLite adapter |
| [SqliteClient](classes/SqliteClient.md)                     | Browser wa-sqlite client.              |
| [SqliteRepository](classes/SqliteRepository.md)             | Repository for operating on entities   |

## Interfaces

| Interface                                                                    | Description                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [GenerateSqlResult](interfaces/GenerateSqlResult.md)                         | SQL generation result: the complete SQL statement and optional parameter bindings.                          |
| [LoadedSqlite](interfaces/LoadedSqlite.md)                                   | Return value of [waSqliteLoad](functions/sqliteLoad.md): the initialized SQLite API and its registered VFS. |
| [ResolvedWaSqliteClientOptions](interfaces/ResolvedWaSqliteClientOptions.md) | Runtime parameters of the wa-sqlite client after normalization.                                             |
| [RxDBAdapterSqliteBase](interfaces/RxDBAdapterSqliteBase.md)                 | Backend-agnostic SQLite adapter base class.                                                                 |
| [SqliteOptions](interfaces/SqliteOptions.md)                                 | wa-sqlite adapter configuration.                                                                            |
| [WaSqliteClientRuntime](interfaces/WaSqliteClientRuntime.md)                 | Platform runtime of the wa-sqlite client.                                                                   |
| [WaSqliteVfsConfig](interfaces/WaSqliteVfsConfig.md)                         | Read-only capabilities and loading configuration of a wa-sqlite VFS.                                        |
| [WaSqliteVfsFactory](interfaces/WaSqliteVfsFactory.md)                       | Minimal factory shape exposed by the upstream example VFS modules.                                          |

## Type Aliases

| Type Alias                                                                 | Description                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [LoadModuleOptions](type-aliases/LoadModuleOptions.md)                     | Configuration required for loading the wa-sqlite module and initializing the client. |
| [SqliteRepositoryConstructor](type-aliases/SqliteRepositoryConstructor.md) | Constructor type of the SQLite repository.                                           |
| [SupportVFS](type-aliases/SupportVFS.md)                                   | Supported virtual filesystem types.                                                  |

## Variables

| Variable                                                                                 | Description                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [BATCH\_TIMEOUT](variables/BATCH_TIMEOUT.md)                                             | Change-event batch timeout tiers (milliseconds). Shorter means lower latency but more frequent CPU wakeups; longer saves power but delays UI responses. - `IMMEDIATE` (0): synchronous dispatch, only for test scenarios - `FAST` (4): coalesced within about one frame - `BALANCED` (16): default, about one frame (60fps) - `POWER_SAVE` (50): mobile / background scenarios |
| [buildRuleGroup](variables/buildRuleGroup.md)                                            | Builds the ruleGroup SQL query condition                                                                                                                                                                                                                                                                                                                                       |
| [ROWID](variables/ROWID.md)                                                              | Column name of the sqlite row id                                                                                                                                                                                                                                                                                                                                               |
| [sqliteGetTableName](variables/sqliteGetTableName.md)                                    | Assembles the physical name of the main table set: `<namespace>$<logical name>`.                                                                                                                                                                                                                                                                                               |
| [sqliteGetTableNameByMetadata](variables/sqliteGetTableNameByMetadata.md)                | Physical table name of an entity in a given table set.                                                                                                                                                                                                                                                                                                                         |
| [WA\_SQLITE\_MAX\_DATABASE\_NAME\_BYTES](variables/WA_SQLITE_MAX_DATABASE_NAME_BYTES.md) | Maximum UTF-8 bytes of the database name accepted by the wa-sqlite browser VFS.                                                                                                                                                                                                                                                                                                |
| [WA\_SQLITE\_VFS\_LIST](variables/WA_SQLITE_VFS_LIST.md)                                 | VFS supported by wa-sqlite and their runtime capabilities; the array, its entries and nested options are all immutable.                                                                                                                                                                                                                                                        |

## Functions

| Function                                                              | Description                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| [assertWaSqliteDatabaseName](functions/assertWaSqliteDatabaseName.md) | Validates the database name before loading the browser VFS. |
| [sqliteLoad](functions/sqliteLoad.md)                                 | Loads the wa-sqlite module and registers the selected VFS.  |

## References

### RxDBAdapterWaSqlite \{#rxdbadapterwasqlite\}

Renames and re-exports [RxDBAdapterSqlite](classes/RxDBAdapterSqlite.md)

---

### WaSqliteClient \{#wasqliteclient\}

Renames and re-exports [SqliteClient](classes/SqliteClient.md)

---

### waSqliteLoad \{#wasqliteload\}

Renames and re-exports [sqliteLoad](functions/sqliteLoad.md)

---

### WaSqliteOptions \{#wasqliteoptions\}

Renames and re-exports [SqliteOptions](interfaces/SqliteOptions.md)

---

### WaSqliteRepositoryConstructor \{#wasqliterepositoryconstructor\}

Renames and re-exports [SqliteRepositoryConstructor](type-aliases/SqliteRepositoryConstructor.md)

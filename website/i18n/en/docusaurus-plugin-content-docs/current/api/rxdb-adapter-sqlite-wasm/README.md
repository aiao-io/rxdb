# rxdb-adapter-sqlite-wasm

RxDB SQLite adapter based on [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm).

Shares the core capabilities in `@aiao/rxdb-adapter-sqlite-core` with `@aiao/rxdb-adapter-wa-sqlite`; the difference is that the underlying SQLite WASM is provided by the subframe package (a custom wa-sqlite with FTS5 / UPDATE DELETE LIMIT support and built-in typesafe VFS presets).

## When to use

- When you need the enhanced SQLite features provided by subframe (UPDATE/DELETE LIMIT)
- When you need typesafe VFS presets
- When you need more flexible VFS selection (including OPFS FileHandle)

## Comparison with other SQLite adapters

| Feature | sqlite-wasm | wa-sqlite | sqlite-wasm (official) |
| ------------------- | ------------------------- | --------- | ----------------------- |
| Underlying library | @subframe7536/sqlite-wasm | wa-sqlite | @sqlite.org/sqlite-wasm |
| UPDATE/DELETE LIMIT | ✅ | ❌ | ❌ |
| VFS presets | Typesafe | Manual config | Manual config |
| OPFS FileHandle | ✅ | ❌ | ✅ |
| Package size | ~800KB | ~500KB | ~1MB |

## Supported storage (VFS presets)

| `vfs` value | Description | Runtime environment |
| ------------ | --------------------------------------------- | --------------- |
| `memory` | Pure in-memory, `MemoryVFS` | Main thread/Worker |
| `idb` | IndexedDB, `IDBBatchAtomicVFS` | Main thread/Worker |
| `idb-memory` | Memory + IndexedDB mirror, `IDBMirrorVFS` | Main thread/Worker |
| `opfs` | OPFS, `OPFSCoopSyncVFS` | **Worker required** |
| `fs-handle` | Local file / OPFS FileHandle, `OPFSAnyContextVFS` | Main thread/Worker |

## Installation

```bash
npm install @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm
# or
pnpm add @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm
```

When running in a Worker / SharedWorker (required by `opfs`), the Worker file needs you to `import { expose } from 'comlink'` yourself,
so you also need to install comlink — it is an **optional peer dependency** of this package; pnpm in strict mode will not expose core's transitive dependencies to you:

```bash
npm install comlink
# or
pnpm add comlink
```

## Usage

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [/* entity classes */],
  sync: {
    local: { adapter: 'sqlite-wasm' },
    type: SyncType.None
  }
});

rxdb.adapter('sqlite-wasm', async db => new RxDBAdapterSqlite(db, { vfs: 'idb' }));

await rxdb.connect('sqlite-wasm');
```

Running in a Worker (the `opfs` VFS requires a Worker):

```ts
// sqlite-wasm.worker.ts
import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

expose(new SqliteClient());
```

```ts
// Main thread: passing a workerInstance itself selects the Worker transport
rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'opfs',
      worker: true,
      workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), { type: 'module' }),
      workerOwnership: 'client'
    })
);
```

`workerOwnership` defaults to `caller`: the same Worker can establish a new connection after `disconnect`,
but the caller must eventually call `worker.terminate()`. When creating the Worker inside the adapter factory as in the example above,
use `client`, so that disconnect or initialization failure releases the Comlink port and terminates the thread.

When calling `createSqliteClient` directly, `await client.disconnect()` first, then call
`releaseComlinkProxy(client)` exported from the package root entry; `RxDBAdapterSqlite` already releases the proxy automatically inside `disconnect()`.

### Multiple tabs sharing one connection (SharedWorker)

Put one `SqliteClient` in a SharedWorker and `expose` it on every connected port, and multiple tabs share that one connection: transactions are queued by database name behind one cross-tab
Web Lock (`navigator.locks`), and the transaction left behind by a tab that died mid-transaction is rolled back by the next tab that acquires the lock; when one tab disconnects it only returns its own share,
the database is closed only when the last one disconnects, and it can connect again afterwards (`SqliteClient.release(owner)`). As with Worker, passing only `sharedWorkerInstance` without writing
`sharedWorker: true` also selects the SharedWorker transport, with exactly the same queueing and disconnect rules.

## Backup and restore

`backup()` / `restore()` / `cleanupIncompleteRestore()` are provided by [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core/README.md); see there for their semantics and error codes.

| VFS | Backup / restore |
| -------- | ----------------------------------------------- |
| `memory` | ✅ in-memory database |
| `idb` | ✅ IndexedDB, persisted with `journal_mode` `delete` |
| Other VFS | ❌ `unsupported_combination` (`vfs`) |

The combinations in the table are only delivered on main-thread connections: when `worker` / `workerInstance` or `sharedWorker` / `sharedWorkerInstance` is set, all three entry points report `unsupported_combination` (`transport`, with `actual` being `worker` or `sharedWorker`) and do not touch the output stream or the archive source.

## Full example

See the integration examples in [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular).

## Fileoverview

Entry point of the `@aiao/rxdb-adapter-sqlite-wasm` package.

Browser-side @subframe7536/sqlite-wasm adapter. The structure corresponds one-to-one with `rxdb-adapter-wa-sqlite`,
only the underlying SQLite implementation is replaced by sqlite-wasm plus the derived VFS loading logic.

Entry layering:
- core shared types and functions (re-exported from `@aiao/rxdb-adapter-sqlite-core`)
- the adapter itself, `RxDBAdapterSqlite`
- the client `SqliteClient`, responsible for the SQLite connection, change interception, and batch dispatch
- the loading utility `sqliteLoad`: lazily loads the sqlite-wasm artifact according to the chosen VFS

## Classes

| Class | Description |
| ------ | ------ |
| [RxDBAdapterSqlite](classes/RxDBAdapterSqlite.md) | Browser @subframe7536/sqlite-wasm adapter. |
| [RxDBAdapterSqliteError](classes/RxDBAdapterSqliteError.md) | Error class for the RxDB SQLite adapter |
| [SqliteClient](classes/SqliteClient.md) | Typesafe synchronous event dispatcher. |
| [SqliteRepository](classes/SqliteRepository.md) | Repository for operating on entities |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [GenerateSqlResult](interfaces/GenerateSqlResult.md) | SQL generation result: the complete SQL statement and optional parameter bindings. |
| [RxDBAdapterSqliteBase](interfaces/RxDBAdapterSqliteBase.md) | Backend-agnostic SQLite adapter base class. |
| [SqliteOptions](interfaces/SqliteOptions.md) | SQLite adapter configuration interface |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [SupportVFS](type-aliases/SupportVFS.md) | Supported @subframe7536/sqlite-wasm storage presets |

## Variables

| Variable | Description |
| ------ | ------ |
| [buildRuleGroup](variables/buildRuleGroup.md) | Generate the ruleGroup SQL query condition |
| [ROWID](variables/ROWID.md) | sqlite row id column name |
| [SQLITE\_WASM\_VFS\_LIST](variables/SQLITE_WASM_VFS_LIST.md) | - |
| [sqliteGetTableName](variables/sqliteGetTableName.md) | Compose the physical name of the primary table set: `<namespace>$<logical name>`. |
| [sqliteGetTableNameByMetadata](variables/sqliteGetTableNameByMetadata.md) | The physical table name of an entity in the given table set. |

## Functions

| Function | Description |
| ------ | ------ |
| [createSqliteClient](functions/createSqliteClient.md) | Create and initialize the sqlite-wasm client. |
| [releaseComlinkProxy](functions/releaseComlinkProxy.md) | Release the MessagePort held by the Comlink proxy. |
| [sqliteLoad](functions/sqliteLoad.md) | Load and initialize @subframe7536/sqlite-wasm |

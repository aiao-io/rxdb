# @aiao/rxdb

The TypeScript database core for local-first applications. `@aiao/rxdb` defines entities from metadata, provides type-safe repositories, and exposes reactive queries over browser, desktop, and remote adapters.

The core stays independent from storage. Add an adapter such as wa-sqlite, SQLite WASM, PGlite, Supabase, or an HTTP QueryCache adapter, then use the same entity model from Angular, React, or Vue.

## Install

```bash
pnpm add @aiao/rxdb rxjs
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

The repository targets Node.js 26+, pnpm 10+, TypeScript 6, and RxJS 7.8+.

## Define an entity

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  tableName: 'todo',
  namespace: 'public',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'done', type: PropertyType.boolean }
  ]
})
export class Todo extends EntityBase {
  declare title: string;
  declare done: boolean;
}
```

## Connect, write, and query

Serve `wa-sqlite-async.wasm` from the installed adapter’s `wa-sqlite/dist` dependency at `/wa-sqlite/wa-sqlite-async.wasm`.

```ts
import { firstValueFrom } from 'rxjs';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const database = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});

database.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, {
  vfs: 'IDBBatchAtomicVFS',
  async: true,
  wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
}));
await database.connect('wa-sqlite');

const repository = database.entityManager.getRepository(Todo);
await repository.create(database.entityManager.instantiate(Todo, { title: 'Write docs', done: false }));

const todos = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));
```

Queries return RxJS observables. Writes update active query results through the same local-first change pipeline.

## Choose an adapter

- `@aiao/rxdb-adapter-wa-sqlite` for the default browser-local SQLite path.
- `@aiao/rxdb-adapter-sqlite` or `@aiao/rxdb-adapter-sqlite-wasm` for SQLite WASM variants.
- `@aiao/rxdb-adapter-pglite` for PostgreSQL semantics in the browser.
- `@aiao/rxdb-adapter-supabase` and `@aiao/rxdb-adapter-http` for remote synchronization and QueryCache.
- `@aiao/rxdb-adapter-electron` or `@aiao/rxdb-adapter-tauri` for desktop storage.

## Public contracts

The package exports entity metadata, repositories, queries, transactions, migrations, sync contracts, structured errors, and adapter interfaces. Narrow caught errors to the concrete class before reading `code` or the context fields below. Use the code for application logic and translated UI messages. The base `RxDBError` also accepts plain messages.

| Code | How to handle it |
| --- | --- |
| `RXDB_PARTIAL_SYNC` | Inspect `result` for changes already applied and `cause` for the interruption. A retry starts from the updated watermarks. |
| `RXDB_QUERY_CACHE_CAPABILITY_MISSING` | Inspect `side` and `missing` to find the adapter members needed by QueryCache. |
| `RXDB_LOCAL_ADAPTER_CAPABILITY_MISSING` | Supply the members in `missing` on the named local adapter. |
| `RXDB_PLUGIN_MISSING` | Install `packageName` and apply the suggested `registration` before connecting. |
| `mixed_versioned_cache_transaction` | Put versioned and QueryCache entities in separate transactions. This existing code uses lowercase. |
| `RXDB_READ_ONLY` | Run the rejected `operation` on a writable instance. |
| `RXDB_NETWORK_OFFLINE` | Inspect `originalError` and retry when connectivity returns. |
| `RXDB_PLUGIN_DEPENDENCY_CYCLE` | Remove the loop listed in `cycle`. |
| `RXDB_PLUGIN_AMBIGUOUS_DEPENDENCY` | Inspect `candidates` and give the dependency one unambiguous registration. |
| `RXDB_CHECK_VIOLATION` | Inspect `constraint` and the conflicting values in `conflicts`, then correct the write. |
| `RXDB_EXCLUSION_VIOLATION` | Inspect `constraint` and `ranges`, then resolve the overlapping records. |
| `RXDB_CONSTRAINT_DRIFT` | Compare `tableName`, `missing` and `extra` with the deployed schema and apply the required migration. |

Use `@aiao/rxdb/testing` for test helpers. Run the core package tests with:

```bash
pnpm nx test rxdb --run
```

Read the [English entity model and adapter documentation](https://rxdb.aiao.io/en/docs/getting-started/) for the complete setup path. Chinese readers can use [README.zh-CN.md](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb/README.zh-CN.md).

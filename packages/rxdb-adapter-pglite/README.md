# @aiao/rxdb-adapter-pglite

Run PostgreSQL locally with PGlite. Use this adapter for PostgreSQL types and SQL semantics, or for a self-contained in-memory database in tests.

```sh
pnpm add @aiao/rxdb @aiao/rxdb-adapter-pglite rxjs
```

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: {
    type: SyncType.None,
    local: { adapter: 'pglite' }
  }
});

rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: 'memory' }));
await rxdb.connect('pglite');

// Release resources on shutdown.
await rxdb.disconnect('pglite');
```

Choose `store: 'idb'` for persistent browser storage. Register your entity classes in `entities` before connecting. Inside a transaction, use the callback executor’s `getRepository(Entity)` for all reads and writes that belong to that transaction.

`backup()` streams a database archive. Restore with `restorePGliteDatabase()` into an empty, disconnected target. For a memory target, give the returned `database` handle to the same instance through the adapter’s `restoredDatabase` option before connecting. Back up external files separately. [Adapter guide](https://rxdb.aiao.io/en/docs/adapters) · [Runnable transaction example](../../scripts/examples/ai-local/main.ts)

[简体中文](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-pglite/README.zh-CN.md)

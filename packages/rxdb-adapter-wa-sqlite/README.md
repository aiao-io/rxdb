# @aiao/rxdb-adapter-wa-sqlite

Run browser-local SQLite with the `wa-sqlite` WebAssembly engine. `IDBBatchAtomicVFS` is the supported default for persistent, transactional IndexedDB storage.

```sh
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite rxjs
```

Serve `dist/wa-sqlite-async.wasm` from the adapter’s installed `wa-sqlite` dependency at `/wa-sqlite/wa-sqlite-async.wasm`. The JavaScript loader and the WASM binary must match.

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

`MemoryVFS` and `MemoryAsyncVFS` are for tests. OPFS-backed VFS options are experimental and have individual worker requirements. Pass `worker` with `workerInstance` or `sharedWorker` with `sharedWorkerInstance`. The caller owns the worker lifecycle. Inspect the exported `WA_SQLITE_VFS_LIST` for the supported configurations.

The adapter pins its upstream `wa-sqlite` archive to an immutable commit and verifies its integrity in the workspace. Backup and restore use the shared SQLite adapter contracts. [Browser setup](https://rxdb.aiao.io/en/docs/getting-started/install) · [SQLite core](../rxdb-adapter-sqlite-core/README.md)

[简体中文](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-wa-sqlite/README.zh-CN.md)

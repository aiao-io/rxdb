# SQLiteAI adapter

`@aiao/rxdb-adapter-sqliteai` provides SQLite support with AI extensions, based on [@sqliteai/sqlite-wasm](https://www.npmjs.com/package/@sqliteai/sqlite-wasm). On top of standard SQLite capabilities it builds in vector storage and similarity search, suiting scenarios that need local AI inference or semantic retrieval.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-sqliteai
```

## Basic usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqliteai } from '@aiao/rxdb-adapter-sqliteai';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Article],
  sync: { local: { adapter: 'sqliteai' }, type: SyncType.None }
});

rxdb.adapter(
  'sqliteai',
  async db =>
    new RxDBAdapterSqliteai(db, {
      wasmPath: '/sqliteai/sqliteai.wasm',
      opfs: true // use OPFS persistence
    })
);

await rxdb.connect('sqliteai');
```

## Configuration options

```typescript
interface SqliteaiOptions {
  // WASM file path
  wasmPath?: string;
  locateFile?: (name: string) => string;

  // OPFS persistence
  opfs?: boolean;
  opfsProxyPath?: string;
  opfsFallback?: 'memory' | 'throw'; // fallback strategy when OPFS is unavailable, default 'throw'

  // Worker configuration
  worker?: boolean;
  workerInstance?: Worker;
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;

  // Performance tuning
  cacheSizeKb?: number; // default 51200 (50MB)
  batchTimeout?: number; // default 16ms (BALANCED)

  // Debugging
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
}
```

## OPFS persistence

```typescript
rxdb.adapter(
  'sqliteai',
  async db =>
    new RxDBAdapterSqliteai(db, {
      opfs: true,
      // Fall back to an in-memory database when OPFS is unavailable (data not persisted); the default 'throw' fails outright
      opfsFallback: 'memory',
      wasmPath: '/sqliteai/sqliteai.wasm'
    })
);
```

## Worker mode

```typescript
// sqliteai.worker.ts
import { SqliteaiClient } from '@aiao/rxdb-adapter-sqliteai';
import { expose } from 'comlink';

expose(new SqliteaiClient());
```

```typescript
rxdb.adapter(
  'sqliteai',
  async db =>
    new RxDBAdapterSqliteai(db, {
      worker: true,
      workerInstance: new Worker(new URL('./sqliteai.worker', import.meta.url), { type: 'module' }),
      wasmPath: '/sqliteai/sqliteai.wasm'
    })
);
```

## Using with the encryption adapter

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqliteai } from '@aiao/rxdb-adapter-sqliteai';

const rxdb = new RxDB({
  dbName: 'app',
  entities: [Document],
  sync: { local: { adapter: 'sqliteai' }, type: SyncType.None }
});

rxdb.adapter('sqliteai', async db => new RxDBAdapterSqliteai(db, { opfs: true }));
rxdb.init();

const adapter = await rxdb.connect('sqliteai');
await adapter.encryption.unlock({ passphrase: 'my-passphrase' });
```

## Reference

- [SQLite adapter (wa-sqlite)](./sqlite.md)
- [SQLite WASM adapter](./sqlite-wasm.md)
- [Field encryption](./encrypted.md)

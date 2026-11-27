# SQLite adapter

`@aiao/rxdb-adapter-wa-sqlite` lets you run a SQLite database in the browser, based on [wa-sqlite](https://github.com/rhashimoto/wa-sqlite), with support for multiple virtual file systems (VFS) and run modes.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite rxjs
```

## Core concepts

### Virtual file systems (VFS)

The SQLite adapter supports several VFSs; consider both the support level and the host capability when choosing:

- **OPFSCoopSyncVFS**: experimental OPFS backend; dedicated Worker only, does not require SharedArrayBuffer
- **IDBBatchAtomicVFS**: uses IndexedDB, the default and supported production backend

### Run modes

- **Worker**: run in a Web Worker, recommended for OPFS
- **SharedWorker**: run in a Shared Worker, recommended for IDB, shareable across tabs

## Basic usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
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

### Worker files

Worker / SharedWorker files need to be **written by you**: use comlink's `expose` to expose the client to the main thread; comlink must be installed too (`npm install comlink`).

#### sqlite.worker.ts

```typescript
/// <reference lib="webworker" />

import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

const client = new WaSqliteClient();

expose(client);
```

#### sqlite-shared.worker.ts

```typescript
import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

declare let self: SharedWorkerGlobalScope;

const client = new WaSqliteClient();

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  expose(client, port);
};
```

## Configuration options

### The `WaSqliteOptions` interface

```typescript
interface WaSqliteOptions {
  // Virtual file system type (9-value union, defaults to IDBBatchAtomicVFS)
  vfs?:
    | 'MemoryVFS'
    | 'MemoryAsyncVFS'
    | 'IDBBatchAtomicVFS'
    | 'IDBMirrorVFS'
    | 'AccessHandlePoolVFS'
    | 'OPFSAdaptiveVFS'
    | 'OPFSAnyContextVFS'
    | 'OPFSCoopSyncVFS'
    | 'OPFSWriteAheadVFS';

  // Which wasm build to load: true = asyncify (wa-sqlite-async.wasm), false = synchronous (wa-sqlite.wasm).
  // When omitted, decided by the capabilities the selected VFS declares
  async?: boolean;

  // Full URL of the WASM file; must match the build resolved from async
  wasmPath?: string;

  // Custom wasm file location
  locateFile?: (name: string) => string;

  // Web Worker configuration (for OPFS): worker must be provided together with workerInstance
  worker?: boolean;
  workerInstance?: Worker;

  // Shared Worker configuration (for IDB): sharedWorker must be provided together with sharedWorkerInstance,
  // and cannot be enabled together with worker
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;

  // Worker lifecycle ownership: caller (default, keep the thread for reuse by later connections)
  // | client (terminate the Worker when the client proxy is released or initialization fails)
  workerOwnership?: 'caller' | 'client';

  // SQLite page cache (KB), default 51200 (see SQLite PRAGMA cache_size)
  cacheSizeKb?: number;

  // Batch dispatch timeout, default 16
  batchTimeout?: number;
}
```

## VFS configurations

### OPFS + Worker

```typescript
const adapter = new RxDBAdapterWaSqlite(rxdb, {
  vfs: 'OPFSCoopSyncVFS',
  async: false,
  worker: true,
  workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' }),
  wasmPath: '/wa-sqlite/wa-sqlite.wasm'
});
```

Experimental; dedicated Worker only, does not require SharedArrayBuffer.

### IDB + SharedWorker

```typescript
const adapter = new RxDBAdapterWaSqlite(rxdb, {
  vfs: 'IDBBatchAtomicVFS',
  sharedWorker: true,
  sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' }),
  wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
});
```

**Features:**

- ✅ `IDBBatchAtomicVFS` is this package's **default and only production-grade** VFS (all of wa-sqlite's OPFS-family implementations are experimental and must be chosen explicitly after evaluation)
- ✅ SharedWorker runs SQLite on a separate thread, **not blocking the main thread**
- ✅ shares one connection across tabs, avoiding lock conflicts from multiple tabs writing the database at once

**When multiple tabs share this one connection:**

- Transactions queue per database name under one cross-tab Web Lock: while one tab's transaction is open, the other tabs' reads and writes wait for it to finish and never fall into its transaction.
  When a tab dies mid-transaction (close, crash), its transaction stays on the connection, and the next tab to take the lock rolls it back first.
- One tab disconnecting only returns its own share: the other tabs keep reading, writing, and receiving change events; only when the last tab disconnects is the database closed, and tabs opened afterwards can still connect.
- Requires Web Locks (`navigator.locks`, HTTPS or localhost); without them `connect()` errors.
- The client inside the SharedWorker is shared by all tabs: write the worker script as `sqlite-shared.worker.ts` above and `expose` the same client on every port — do not create one client per port.

## Build configuration

### Vite configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // Worker support
  worker: {
    format: 'es'
  },

  // Static assets
  publicDir: 'public',

  // Only SharedArrayBuffer-dependent modes need cross-origin isolation
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  optimizeDeps: {
    exclude: ['@aiao/rxdb-adapter-wa-sqlite']
  }
});
```

### Static assets

Copy the WASM from the same wa-sqlite build the adapter actually depends on into `public`; do not mix in the latest upstream release. See [installation and initialization](/getting-started/install.md) for where the assets come from.

```text
public/
  wa-sqlite/
    wa-sqlite.wasm           # for OPFS
    wa-sqlite-async.wasm     # for IDB
```

## Performance optimization

### 1. Adjust the cache size

`cacheSizeKb` controls the SQLite page cache (default `51200`); increasing it can improve query performance:

```typescript
const adapter = new RxDBAdapterWaSqlite(db, {
  vfs: 'IDBBatchAtomicVFS',
  async: true,
  cacheSizeKb: 51200
});
```

### 2. Batch operations

Use transactions for batch operations (the correct entry point is the adapter's `transaction()`, see [Transactions](/model-mutation/transaction.md)):

```typescript
import type { TransactionExecutor } from '@aiao/rxdb';

const adapter = await rxdb.getAdapter('wa-sqlite');

await adapter.transaction(async (executor: TransactionExecutor) => {
  const todoRepo = executor.getRepository(Todo);
  for (const item of items) {
    // Repositories accept entity instances only, not plain objects
    await todoRepo.create(rxdb.entityManager.instantiate(Todo, { title: item.title }));
  }
});
```

> Since C2, the transaction callback signature is tightened from `(client)` to `(executor: TransactionExecutor)`. Zero-parameter callbacks remain compatible — TypeScript allows fewer parameters.

### 3. Index optimization

Create indexes for frequently queried fields:

```typescript
@Entity({
  indexes: [{ properties: ['createdAt'] }, { properties: ['completed', 'createdAt'] }]
})
export class Todo extends EntityBase {
  // ...
}
```

## Browser compatibility

Governed by actual host capabilities and VFS support levels; browser version numbers are not treated as a complete runtime guarantee:

| run mode                | required capabilities                                           | constraints                                                                                      |
| :---------------------- | :-------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| IDB main thread         | WebAssembly, IndexedDB                                          | default production backend; connections still need Web Locks to coordinate transactions          |
| IDB + SharedWorker      | the above, SharedWorker, Web Locks                              | HTTPS or localhost; multiple tabs share one connection                                           |
| OPFS + dedicated Worker | WebAssembly, OPFS synchronous access handles, Worker, Web Locks | experimental, must be explicitly evaluated; `OPFSCoopSyncVFS` does not require SharedArrayBuffer |

The host may also be affected by private browsing mode, storage quotas, and embedding policies. See the [compatibility matrix](/compatibility.md) for more combinations.

## Troubleshooting

### OPFS unavailable

On browsers or environments without OPFS support, fall back to IDB mode:

```typescript
const available = await checkOPFSAvailable();
if (!available) {
  // Use IDB mode
}
```

### Worker load failure

Make sure the Worker file path is correct:

```typescript
// ✅ correct: use new URL
new Worker(new URL('./sqlite.worker', import.meta.url), {
  type: 'module'
});

// ❌ wrong: a plain string path
new Worker('./sqlite.worker.ts');
```

### WASM file load failure

Check whether the WASM file is at the right path:

```typescript
// Make sure the path matches the file in the public directory
wasmPath: '/wa-sqlite/wa-sqlite.wasm';
```

### Database locking

If multiple tabs accessing the database at once cause locking:

1. Use the SharedWorker mode (IDB)
2. Or implement a coordination mechanism between tabs

## Migration guide

### From IDB to OPFS

The adapter provides [whole-database backup and restore](/adapters/backup.md), but it is not an automatic cross-VFS migration entry; in particular, Worker transport does not support this archive path. To migrate to OPFS Worker while keeping the data: keep the old database connected, move the data with the public query/write APIs into a target database with a **new `dbName`**, and disconnect the old one after verifying (see [Adapter switching and data migration](/migration/adapters.md) for the approach).

```typescript
import { firstValueFrom } from 'rxjs';

// 1. Check browser support
const available = await checkOPFSAvailable();

if (available) {
  // 2. Keep the old (IDB) connection and read all the data
  const todos = await firstValueFrom(Todo.find({}));

  // 3. Connect the OPFS target with a new dbName, so the two underlying stores do not overwrite each other
  const target = new RxDB({
    dbName: 'todo-app-opfs',
    entities: [Todo],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });

  target.adapter('wa-sqlite', async db => {
    return new RxDBAdapterWaSqlite(db, {
      vfs: 'OPFSCoopSyncVFS',
      async: false,
      worker: true,
      workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' })
      // ... OPFS configuration
    });
  });

  await target.connect('wa-sqlite');

  // 4. Write into the target database
  for (const todo of todos) {
    const copy = new Todo();
    Object.assign(copy, todo);
    await copy.save();
  }

  // 5. Disconnect the old database after verifying the counts match
  await rxdb.disconnect('wa-sqlite');
}
```

## Complete example

The example below defaults to IDB. Only call `initDatabase({ experimentalOPFS: true })` after completing the experimental OPFS evaluation; when enabled, it checks the host capabilities and errors when unsupported.

```typescript
import { RxDB, Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';

// Define the entity
@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {}

// Initialize the database
async function initDatabase({ experimentalOPFS = false } = {}) {
  const rxdb = new RxDB({
    dbName: 'todo-app',
    entities: [Todo],
    sync: {
      local: { adapter: 'wa-sqlite' },
      type: SyncType.None
    }
  });

  // Register the SQLite adapter
  rxdb.adapter('wa-sqlite', async db => {
    let options: WaSqliteOptions;
    if (experimentalOPFS && !(await checkOPFSAvailable()))
      throw new Error('This host does not support experimental OPFS');

    if (experimentalOPFS) {
      options = {
        vfs: 'OPFSCoopSyncVFS',
        async: false,
        worker: true,
        workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-worker'
        }),
        wasmPath: '/wa-sqlite/wa-sqlite.wasm',
        cacheSizeKb: 51200
      };
    } else {
      options = {
        vfs: 'IDBBatchAtomicVFS',
        sharedWorker: true,
        sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-shared-worker'
        }),
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
      };
    }

    return new RxDBAdapterWaSqlite(db, options);
  });

  // Connect the database
  await rxdb.connect('wa-sqlite');

  return rxdb;
}

// Use the database
async function main() {
  const rxdb = await initDatabase();

  // Create a todo
  const todo = new Todo();
  todo.title = 'Learn RxDB';
  await todo.save();

  // Query todos
  const todos = await firstValueFrom(
    Todo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'completed', operator: '=', value: false }]
      }
    })
  );

  console.log('Incomplete todos:', todos);
}

main();
```

## Reference

- [wa-sqlite](https://github.com/rhashimoto/wa-sqlite)
- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Model definition](../model-definition/)
- [Installation guide](/getting-started/install.md)

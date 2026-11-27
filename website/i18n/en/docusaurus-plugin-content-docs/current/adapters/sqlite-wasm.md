# SQLite WASM adapter

`@aiao/rxdb-adapter-sqlite-wasm` provides cross-platform SQLite support based on [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm), with built-in FTS5 / UPDATE DELETE LIMIT extensions and type-safe VFS presets.

It shares the `@aiao/rxdb-adapter-sqlite-core` core with `@aiao/rxdb-adapter-wa-sqlite`; the difference is that the underlying WASM comes from the subframe package, with richer VFS presets — it is **one of the FTS5-backend adapters** for `@aiao/rxdb-plugin-search` (sqlite / sqliteai are also compatible; PGlite uses the pg-tsvector backend).

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm @subframe7536/sqlite-wasm@1.4.0
```

The Vite example below imports the underlying WASM asset directly, so the install command explicitly declares `@subframe7536/sqlite-wasm@1.4.0`, matching the adapter's current pin. After an adapter upgrade, sync it with the version fixed in the adapter's `dependencies`; alternatively use the copy-to-`public` approach described later.

## VFS presets

| `vfs` value  | storage backend                    | runtime              | notes                                            |
| ------------ | ---------------------------------- | -------------------- | ------------------------------------------------ |
| `memory`     | pure in-memory `MemoryVFS`         | main thread / Worker | tests / temporary data                           |
| `idb`        | IndexedDB `IDBBatchAtomicVFS`      | main thread / Worker | general persistence, best compatibility          |
| `idb-memory` | memory + IDB mirror `IDBMirrorVFS` | main thread / Worker | high read performance, async mirror writes       |
| `opfs`       | OPFS `OPFSCoopSyncVFS`             | **Worker only**      | synchronous access handles in a dedicated Worker |
| `fs-handle`  | local files `OPFSAnyContextVFS`    | main thread / Worker | OPFS FileHandle or local files                   |

## Basic usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import wasmUrl from '@subframe7536/sqlite-wasm/wasm-async?url';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
});

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'idb',
      wasmUrl
    })
);

await rxdb.connect('sqlite-wasm');
```

## WASM assets

`wasmUrl` must point at the `@subframe7536/sqlite-wasm` artifact actually installed by this adapter. The main-thread IDB example and the board shell use `dist/wa-sqlite-async.wasm`; the OPFS preset uses `dist/wa-sqlite.wasm`. Vite resolves in-package assets with the `?url` import above; alternatively copy the corresponding files into the app's public directory and pass a deployed path such as `/sqlite-wasm/wa-sqlite-async.wasm`.

The repository copies assets from `packages/rxdb-adapter-sqlite-wasm/node_modules/@subframe7536/sqlite-wasm/dist/` to guarantee the adapter's actual dependency. Do not substitute the official SQLite WASM or a same-named file from another wa-sqlite.

## OPFS mode

`OPFSCoopSyncVFS` here requires a dedicated Worker and does not require SharedArrayBuffer; do not apply other VFSs' cross-origin isolation requirements to this combination. The Worker file needs to be **written by you** and expose the client with comlink's `expose` (comlink is an optional peer dependency; install it yourself):

```typescript
// sqlite.worker.ts
import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

expose(new SqliteClient());
```

```typescript
import wasmUrl from '@subframe7536/sqlite-wasm/wasm?url';

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'opfs',
      wasmUrl,
      worker: true,
      workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' })
    })
);
```

## One connection shared across tabs (SharedWorker)

Put one client in the SharedWorker and `expose` the same one for every connecting tab:

```typescript
// sqlite-shared.worker.ts
import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

declare let self: SharedWorkerGlobalScope;

const client = new SqliteClient();

self.onconnect = (event: MessageEvent) => expose(client, event.ports[0]);
```

```typescript
import wasmUrl from '@subframe7536/sqlite-wasm/wasm-async?url';

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'idb',
      wasmUrl,
      sharedWorker: true,
      sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' })
    })
);
```

- Transactions queue per database name under one cross-tab Web Lock: while one tab's transaction is open, the other tabs' reads and writes wait for it to finish and never fall into its transaction.
  When a tab dies mid-transaction (close, crash), its transaction stays on the connection, and the next tab to take the lock rolls it back first.
- One tab disconnecting only returns its own share: the other tabs keep reading, writing, and receiving change events; only when the last tab disconnects is the database closed, and tabs opened afterwards can still connect.
- Passing only `sharedWorkerInstance` without `sharedWorker: true` also selects the SharedWorker transport, with identical queueing and disconnect rules.
- Requires Web Locks (`navigator.locks`, HTTPS or localhost); without them `connect()` errors.
- Backup and restore do not support the SharedWorker transport (`unsupported_combination`).

## Using the full-text search plugin

`@aiao/rxdb-plugin-search` supports two backends, FTS5 and pg-tsvector: the SQLite family allowlists sqlite-wasm / sqlite / sqliteai, PGlite uses pg-tsvector; wa-sqlite and the mini-program adapter are not yet allowlisted. This adapter (FTS5 backend) is used like this:

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
});

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'idb',
      wasmUrl
    })
);

rxdb.use(rxDBPluginSearch);
await rxdb.connect('sqlite-wasm');
```

## Vite configuration

```typescript
// vite.config.ts
export default defineConfig({
  worker: { format: 'es' },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  optimizeDeps: {
    exclude: ['@aiao/rxdb-adapter-sqlite-wasm']
  }
});
```

## Compared with wa-sqlite

| dimension               | `rxdb-adapter-sqlite-wasm`                  | `rxdb-adapter-wa-sqlite`     |
| ----------------------- | ------------------------------------------- | ---------------------------- |
| underlying WASM         | @subframe7536/sqlite-wasm                   | wa-sqlite                    |
| FTS5 support            | ✅ built in                                 | ❌ unsupported               |
| VFS presets             | 5 (including fs-handle)                     | 2                            |
| full-text search plugin | ✅ compatible                               | ❌ incompatible              |
| recommended for         | needing full-text search / more VFS options | simple browser-local storage |

## Reference

- [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm)
- [Full-text search plugin](../plugins/rxdb-plugin-search/README.md)
- [SQLite adapter (wa-sqlite)](./sqlite.md)

# Backup and restore

Local database adapters provide **consistent backup and restore**: generate a versioned, integrity-checked snapshot archive while the database is running, and restore it onto a fresh, empty target. A backup has the same boundary as a committed transaction — never half a transaction, never losing committed data. A restore yields either a complete, verified, connectable database, or it leaves the target untouched.

Currently supported: the SQLite family of local adapters (wa-sqlite / sqlite-wasm / sqlite / sqliteai, plus the Electron / Tauri desktop hosts) and PGlite (browser and Electron). Remote adapters ([HTTP](/adapters/http.md) / [Supabase](/adapters/supabase.md)) are out of scope.

## Supported combinations

The support matrix declares, per adapter, the source / target storage and the runtime; **only same-adapter combinations inside the matrix are promised**. Unlisted combinations report `unsupported_combination` explicitly and never fall back to copying a live database file directly.

| adapter id        | source / target storage                              | runtime                                   | notes                                                                                            |
| ----------------- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pglite`          | `memory` and `idb://` as either source or target     | browser main-thread client                | Worker / OPFS-AHP / desktop-proxy clients report `unsupported_combination`                       |
| `wa-sqlite`       | `MemoryVFS` / `MemoryAsyncVFS` / `IDBBatchAtomicVFS` | browser                                   | main-thread connections only; `worker` / `sharedWorker` configs report `unsupported_combination` |
| `sqlite-wasm`     | `memory` / `idb`                                     | browser                                   | same as above                                                                                    |
| `sqlite`          | in-memory databases and `opfs: true`                 | browser (official sqlite-wasm)            | `worker: true` verified in practice                                                              |
| `sqliteai`        | in-memory databases and `opfs: true`                 | browser                                   | same as above                                                                                    |
| `sqlite-electron` | database file under the app data directory           | Electron main process `node:sqlite` (WAL) | virtual-table databases report `unsupported_combination` (host runs defensive)                   |
| `sqlite-tauri`    | database file under the app data directory           | Tauri 2 Rust host (WAL, FTS5)             |                                                                                                  |
| `pglite-electron` | PGlite directory under the app data directory        | Electron main process PGlite              | host must explicitly enable `backup`                                                             |

Within one adapter, memory and persistent storage can each serve as source or target. Archives from the three desktop combinations (`sqlite-electron` / `sqlite-tauri` / `pglite-electron`) are verified to interchange pairwise across Linux / macOS / Windows; browser combinations do not promise cross-OS restore.

:::warning Engine version requirement

SQLite-family backups use `octet_length()` for paging probes, which requires SQLite ≥ 3.43; on older engines the backup fails immediately with `io_error` and produces no archive. Desktop hosts ship a sufficient engine (Electron bundles 3.53+, Tauri's rusqlite bundles 3.46+).

:::

## Core concepts

### Backup target

The "target" is where the restore lands. It must satisfy all of the following:

- **Empty**: it does not exist, or it contains no database content. An engine directory that was only initialized, system tables, or metadata — even with no business rows — does not count as empty (e.g. the `_sqliteai_vector` table sqliteai creates on every connection); restore reports `target_not_empty` beforehand.
- **Not connected**: the target RxDB instance must not have `connect()`ed already; a connected or currently-restoring target reports `target_busy`.
- **Exclusive**: exclusive access to the target must be acquired first, then the empty state checked, and the exclusivity held until the restore completes or failure handling finishes; during that window, other connections and restore requests are rejected.

An in-memory target is only promised to be usable within the current instance: the restored database lives only in this instance, and once the instance ends it must be restored again from the archive.

### Archive

The archive is a streaming container (`backup-archive`) defined by the `@aiao/rxdb` core and shared by both adapter families:

- An 8-byte magic `RXDBBAK\x01`, followed by a frame sequence of `type (1 byte) + length (4-byte big-endian) + payload`: manifest → one entry-header frame plus data frames per entry → end marker.
- Data frames never exceed `RXDB_BACKUP_CHUNK_SIZE` (64 KiB) and JSON frames never exceed 64 KiB; readers reject oversized frames. This is where the memory bound on both ends comes from: the codec layer never holds more than one frame plus one chunk of the input stream.
- The end marker records the entry count, the file byte count, and the SHA-256 of **all archive bytes before the end marker**. The digest is only known once the end is reached, so restore must first write the data into a discardable staging area and can only commit after `end`.
- Input that runs out before the end marker reports `truncated_archive`; bytes after the end marker report `corrupt_archive`.

The two adapter families lay out the archive differently:

| adapter family | archive contents                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite family  | Logical dump: `sqlite/schema.json` (all table / index / view / trigger / virtual-table creation statements, `user_version`, `application_id`, `sqlite_sequence`), `sqlite/rows/<table>/<sequence>` segmented per table (`quote()` row literals, roughly one entry per 1 MiB, 32 MiB max per row), `sqlite/summary.json` (row count per table). Virtual tables record only their creation statement; data follows the shadow tables |
| PGlite         | per-file snapshot of the data directory; the runtime files `postmaster.pid` / `postmaster.opts` / `pg_internal.init` (`PGLITE_EXCLUDED_FILES`) are not archived                                                                                                                                                                                                                                                                    |

### Manifest

The archive begins with a manifest (`RxDBBackupManifest`); compatibility is validated **before** anything is written to the target. Fields and comparison rules:

| field                                                  | content                                                                                     | on restore                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `format` / `formatVersion`                             | `rxdb-backup` / `1`                                                                         | must match verbatim                             |
| `scope`                                                | declaration of database and external file coverage                                          | validated                                       |
| `adapter.name`                                         | adapter id, e.g. `pglite`                                                                   | equal                                           |
| `adapter.engine` / `adapter.engineCompatibility`       | engine and data compatibility keys (`sqlite` / `sqlite-3`, `postgres` / `postgres-<major>`) | equal                                           |
| `adapter.extensions`                                   | extensions loaded by the source database                                                    | target must provide everything the archive used |
| `adapter.engineVersion` / `adapter.storage`            | full engine version, source storage backend                                                 | recorded only                                   |
| `rxdb.version`                                         | source RxDB version                                                                         | recorded only                                   |
| `rxdb.systemSchemaVersion` / `rxdb.changeCodecVersion` | internal versions                                                                           | equal                                           |
| `schemaFingerprint`                                    | entity schema fingerprint                                                                   | equal                                           |
| `encryption.authDomain`                                | encryption auth domain (`null` without encryption)                                          | equal, otherwise `auth_domain_mismatch`         |

### Schema fingerprint

`computeRxDBSchemaFingerprint(entities)` SHA-256s the storage-relevant fields of user entities — `namespace` / `name` / `tableName` / `extends` / properties / computed properties / relations / indexes / foreign keys / features — as canonicalized JSON (keys sorted by code point, display text such as `displayName` / `description` dropped, bigint / dates / binary tagged with their types). It does not depend on the entity declaration order; system entities do not participate (system table structure is gated separately by `rxdb.systemSchemaVersion`).

Both backup and restore compute and compare the fingerprint automatically — **normal flows never need to call it**. It is exported from `@aiao/rxdb` for tooling and tests:

```typescript
import { computeRxDBSchemaFingerprint } from '@aiao/rxdb';

const fingerprint = computeRxDBSchemaFingerprint([Todo, Tag]);
```

The encryption auth domain (`getRxDBBackupAuthDomain`) works the same way: the database name when any entity declares encrypted columns, otherwise `null`. Both ends use the same algorithm from the core package, which keeps the values comparable.

### Locks

Restore and normal connections need cross-context mutual exclusion, guaranteed by two layers:

- **Web Locks** (`tryAcquireRxDBBackupLock`): restore takes an `exclusive` lock and normal connections take a `shared` lock, under the lock name `rxdb-sqlite-storage:<storageKey>` (SQLite) or `rxdb-pglite-storage:<storageKey>` (PGlite). Failure to acquire reports `target_busy` **immediately** — no queueing, because queueing would make restore wait on a connection that may never disconnect. Environments without Web Locks report `unsupported_combination`.
- **In-database markers**: a SQLite persistent target first commits a marker table `rxdb$restore_in_progress` separately, deleting it after it is written and verified; a PGlite IndexedDB target first writes an `rxdb-pglite-restore` marker, removed once validation and persistence complete. While a marker exists, both normal connections and restore report `restore_incomplete`, and cleanup must happen first.

Backup's wait for the consistency lock is bounded by `lockTimeoutMs`, default 30 seconds (`PGLITE_BACKUP_LOCK_TIMEOUT_MS` / `SQLITE_BACKUP_LOCK_TIMEOUT_MS` are both `30_000`); a timeout reports `lock_timeout`. Calling backup inside a transaction callback of the same adapter waits on itself and can only escape through this bound.

### Queue

Each adapter has its own serial queue (`AsyncQueueExecutor`); backup tasks run through `runRxDBBackupWhenQueued`. Only the "still queued" phase is governed by timeout and cancellation: once a task starts executing it is handed to its own cancellation logic (the archive writer checks the signal before every write) — otherwise the timeout callback would release the caller while the snapshot is half written and the task still holds the database.

## Installation

Backup ships with the adapters; nothing extra to install:

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

## Backup

The backup entry point is `backup()` on a connected adapter:

```typescript
adapter.backup(sink: WritableStream<Uint8Array>, options?: RxDBBackupOptions): Promise<RxDBBackupResult>
```

- The output stream is `close()`d on success and `abort()`ed on failure; backup only returns after the sink's `close()` resolves — **the persistence after close (disk writes, uploads) is the caller-provided stream's responsibility**.
- Cancellation (`options.signal`) is only promised up to the successful commit boundary: cancellation before the boundary aborts the operation and cleans up; a completed operation is not rolled back by a late cancellation.
- Errors are thrown with a stable classification (see [Error codes](#error-codes)).

### SQLite adapters

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
await rxdb.connect('wa-sqlite');

const adapter = await rxdb.getAdapter('wa-sqlite');
const handle = await showSaveFilePicker({ suggestedName: 'myapp.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());

console.log(result.entries); // entry count (files + directories)
console.log(result.bytes); // total file data bytes
console.log(result.sha256); // archive SHA-256
console.log(result.manifest); // archive manifest
console.log(result.scope); // { database: 'included', externalFiles: 'excluded' }
```

SQLite backup is a **logical dump**: inside the adapter's serial queue it opens a read transaction and writes out the schema, the table-segmented rows, and the summary — reading the committed state the SQL layer sees, without copying any database file. There is therefore no "main file vs WAL divergence" path: data committed in the WAL is included.

### PGlite

The call shape is identical:

```typescript
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

const adapter = await rxdb.getAdapter('pglite');
const handle = await showSaveFilePicker({ suggestedName: 'myapp.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
```

PGlite's snapshot runs `CHECKPOINT` first while holding both the query lock and the transaction lock, then reads the data directory file by file. When `idb://` storage is also open in other connections (another instance on the same page, another tab, or a Worker), it reports `target_busy`: every connection has its own in-memory view, and this connection's snapshot cannot see their commits.

### Options

```typescript
const controller = new AbortController();

await adapter.backup(sink, {
  signal: controller.signal, // cancellation up to the successful commit boundary
  lockTimeoutMs: 30_000 // bound for waiting on the consistency lock, default 30 seconds
});
```

:::warning Writes queue during backup

**The entire write-out holds the database**: while the output stream applies backpressure (slow disk, network upload), reads and writes queue for that window. Point the output at a fast enough target; calling backup inside this adapter's transaction callback waits on itself until `lock_timeout` after `lockTimeoutMs`.

:::

## Restore

Restore only writes to an **empty** target; it never merges or overwrites. Compatibility (adapter, engine major version, virtual-table modules, system table / change-codec versions, entity schema fingerprint, encryption auth domain) is decided before the first statement is written; the database only becomes visible to normal connections after all checks pass and the persistence the backend promises has completed.

### SQLite adapters

`restore()` must be called **before** `rxdb.connect()`, and the target instance itself must not already be connected:

```typescript
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

// Target instance: register the adapter only, do not connect
const target = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
target.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await target.getAdapter('wa-sqlite');

const [handle] = await showOpenFilePicker();
const file = await handle.getFile();
await adapter.restore(file.stream());

await target.connect('wa-sqlite'); // persistent target: connect normally once restore completes
```

- **Persistent storage**: after restore completes, just `connect()` normally; if the page closes mid-restore, later connections report `restore_incomplete`, and cleanup must happen first (see below).
- **In-memory storage**: the restored database lives only in this instance and is taken over by the next `connect()`; `disconnect()` releases it when not connecting.

Change events are silent during restore: restored rows are not new changes and produce no business change history. An encrypted database stays locked.

### PGlite

PGlite restore is a **free function** (the target is not connected yet, so there is no adapter to call). The target instance is `init()`ed (computing the entity set) but not connected; `options` must be the **same options object** passed later to `new RxDBAdapterPGlite(rxdb, options)`:

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite, restorePGliteDatabase } from '@aiao/rxdb-adapter-pglite';

const options = { store: 'idb' };
const target = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

await restorePGliteDatabase(archiveStream, { rxdb: target, options });

target.adapter('pglite', db => new RxDBAdapterPGlite(db, options));
await target.connect('pglite');
```

IndexedDB targets: nothing is persisted until validation passes; the commit point is one complete flush into IndexedDB. An exclusive Web Lock and the persistent marker protect the whole process.

**In-memory targets**: an in-memory database has no "reopen the same location later" — the restore result is handed to the adapter through a `PGliteRestoredDatabase` handle. The handle can be claimed exactly once, and only by the RxDB instance validated during restore, with the same set of extensions:

```typescript
import { RxDBAdapterPGlite, restorePGliteDatabase } from '@aiao/rxdb-adapter-pglite';

const options = { store: 'memory' };
const target = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

const { database } = await restorePGliteDatabase(archiveStream, { rxdb: target, options });

target.adapter('pglite', db => new RxDBAdapterPGlite(db, { ...options, restoredDatabase: database }));
await target.connect('pglite');
```

### Cleaning up incomplete restores

When the page closed mid-restore, or a failed restore's own cleanup also failed, the target keeps an incomplete marker and later connections report `restore_incomplete`. Cleanup must be called before connecting; without a marker it does nothing, and in-memory storage has nothing left behind:

```typescript
import { isRxDBBackupError } from '@aiao/rxdb';
import { cleanupIncompletePGliteRestore } from '@aiao/rxdb-adapter-pglite';

try {
  await restorePGliteDatabase(archiveStream, { rxdb: target, options });
} catch (error) {
  if (isRxDBBackupError(error, 'restore_incomplete')) {
    await cleanupIncompletePGliteRestore({ rxdb: target, options });
    // restore can be retried after cleanup
  }
  throw error;
}
```

The SQLite-family counterpart is an adapter method:

```typescript
await adapter.cleanupIncompleteRestore(); // returns true when residue was actually cleaned up
```

:::tip Ordinary failures need no manual cleanup

A failed restore auto-cleans the target and returns it to the "never restored" state, so you can retry directly. The cleanup function is only needed for `restore_incomplete` (a previous run did not finish) or `cleanup_pending` (the cleanup after a failure also failed).

:::

### Stage callbacks and cancellation

`restore()` accepts stage callbacks (which are `await`ed, usable for progress display) and a cancellation signal:

```typescript
await adapter.restore(archiveStream, {
  signal: controller.signal,
  onStage: stage => console.log(stage)
  // SQLite persistent target: marker-written → rows-written → verified → persisted
  // PGlite IndexedDB target: marker-written → files-written → verified → persisted
  // in-memory targets only fire rows/files-written and verified
});
```

## Low-level functions

Free functions and constants above the adapters, for adapter implementers and advanced scenarios; application code should prefer the adapter methods above.

From `@aiao/rxdb-adapter-sqlite-core`:

| export                               | signature                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `writeSqliteBackup`                  | `(input: SqliteBackupInput, sink: WritableStream<Uint8Array>, options: RxDBBackupOptions) => Promise<RxDBBackupResult>`           |
| `restoreSqliteDatabase`              | `(source: ReadableStream<Uint8Array>, input: SqliteRestoreInput, options: SqliteRestoreOptions) => Promise<SqliteRestoreOutcome>` |
| `cleanupIncompleteSqliteRestore`     | `(input: SqliteRestoreInput) => Promise<boolean>`                                                                                 |
| `describeSqliteDatabase`             | `(executor: SqliteBackupExecutor) => Promise<SqliteBlankDatabase>`                                                                |
| `sqliteStorageLockName`              | `(storageKey: string) => string`                                                                                                  |
| `SQLITE_BACKUP_ENGINE`               | `'sqlite'`                                                                                                                        |
| `SQLITE_BACKUP_ENGINE_COMPATIBILITY` | `'sqlite-3'`                                                                                                                      |
| `SQLITE_BACKUP_LOCK_TIMEOUT_MS`      | `30_000`                                                                                                                          |

`describeSqliteDatabase` describes a database's object list, schema, and all rows; restore uses it to decide whether the target "exactly equals the empty database a fresh engine creates" (it compares the object list and per-table row counts first, and only reads rows when they match, so a target whose engine tables hold many rows is never fully read into memory). `SqliteRestoreOutcome.client` is non-null only for in-memory target restores, where the adapter takes it over.

From `@aiao/rxdb-adapter-pglite`:

| export                           | signature                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `restorePGliteDatabase`          | `(source: ReadableStream<Uint8Array>, target: PGliteRestoreTarget, options?: PGliteRestoreOptions) => Promise<PGliteRestoreResult>` |
| `cleanupIncompletePGliteRestore` | `(target: PGliteRestoreTarget) => Promise<boolean>`                                                                                 |
| `verifyPGliteRestored`           | `(db: PGliteQueryable, manifest: RxDBBackupManifest) => Promise<void>`                                                              |
| `PGliteRestoredDatabase`         | one-shot handle of an in-memory target (`consumed` / `close()`)                                                                     |
| `PGLITE_BACKUP_LOCK_TIMEOUT_MS`  | `30_000`                                                                                                                            |
| `PGLITE_EXCLUDED_FILES`          | set of runtime files not archived                                                                                                   |
| `PGLITE_DATA_DIR`                | `'/pglite/data'`                                                                                                                    |

From `@aiao/rxdb` (archive container and error classification, shared by both ends):

| export                                                                        | description                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `RxDBBackupError` / `isRxDBBackupError(error, code?)` / `RxDBBackupErrorCode` | stable error classification; branch on `code` only, `message` is human-readable only                  |
| `RxDBBackupArchiveWriter` / `RxDBBackupArchiveReader`                         | streaming archive writer / reader; call order `writeManifest` → `beginEntry` / `writeData` → `finish` |
| `RXDB_BACKUP_CHUNK_SIZE`                                                      | `64 * 1024`                                                                                           |
| `parseRxDBBackupManifest` / `assertRxDBBackupCompatible`                      | manifest validation and compatibility decision                                                        |
| `computeRxDBSchemaFingerprint`                                                | `(entities: readonly EntityType[]) => string`                                                         |
| `RXDB_BACKUP_FORMAT` / `RXDB_BACKUP_FORMAT_VERSION` / `RXDB_BACKUP_SCOPE`     | `'rxdb-backup'` / `1` / `{ database: 'included', externalFiles: 'excluded' }`                         |

## Boundaries and guarantees

:::warning Only same-adapter combinations are promised

An archive can only be restored to a target with the **same adapter and the same RxDB version line** in the support matrix (system schema / change-codec versions are compared for equality; archives produced by older clients report `incompatible_archive`). Migration and format conversion between different adapters or database engines is out of scope. Encrypted archives additionally require the target auth domain (currently the database name) to be exactly identical.

:::

:::warning External files are not in the archive

The backup scope is the **database itself**: user tables, relations, system tables, change history, database objects, and the keyring's non-secret metadata. The external file bodies managed by `rxdb-plugin-storage` are **not in the archive** — the result and manifest declare this as `scope: { database: 'included', externalFiles: 'excluded' }`. Callers must back up external files separately and must not report "full application backup succeeded" on this basis.

:::

- **Keys never enter the archive**: keys, passphrases, and key provider secrets do not enter the archive; the keyring's non-secret metadata required for unlocking (salt / kid / KDF identifier / verifier) is kept. Backup and restore do not require unlocking, and a restored database stays locked by default; a missing or wrong key only fails unlocking and never changes the restored ciphertext.
- **Failure atomicity**: restore only becomes visible to normal connections after the database is complete, verified, and persisted. On failure it exposes no half-restored database and modifies no existing database; handleable errors auto-clean this run's temporary resources and allow retry, and when the cleanup fails it returns `cleanup_pending` and refuses connections.
- **Process interruption**: if the process is killed mid-restore, reopening the target yields either a complete and verified database or a distinguishable incomplete state (`restore_incomplete`); the incomplete state supports safe cleanup and retry and is never masked as an empty database by automatic initialization.
- **Corrupt archives are only rejected**: corrupt or incomplete archives always report `corrupt_archive` / `truncated_archive`, with no speculative recovery; automatic repair of a corrupt database is out of scope.
- **Not done**: overwriting or merging a non-empty database, selective entity restore, JSON / CSV import and export, encryption auth domain renaming, key rotation, remote adapters (HTTP / Supabase), whole-machine / app-settings backup — all out of scope.

## Error codes

Backup and restore failures always throw `RxDBBackupError`; branch on `code` (`message` is human-readable only). `details.field` / `expected` / `actual` give structured detail:

| code                      | meaning                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `unsupported_combination` | adapter / storage combination outside the support matrix, or the adapter does not implement the capability                   |
| `incompatible_archive`    | archive metadata missing or incompatible with the target configuration (`details.field` points at which one)                 |
| `auth_domain_mismatch`    | the encrypted archive's auth domain differs from the target                                                                  |
| `corrupt_archive`         | format corruption, digest mismatch, or declaration inconsistent with the payload                                             |
| `truncated_archive`       | input ended before the archive's end marker                                                                                  |
| `target_not_empty`        | target already contains any database content (including an engine directory that was only initialized)                       |
| `target_busy`             | target is held by another connection or restore operation; or the backup source's storage is still held by other connections |
| `restore_in_progress`     | a normal connection ran into an in-progress restore                                                                          |
| `restore_incomplete`      | target carries a marker of an unfinished restore; clean up before restoring                                                  |
| `cleanup_pending`         | the cleanup after a failure itself failed; the target stays unfinished and refuses connections                               |
| `aborted`                 | caller cancelled before the successful commit boundary                                                                       |
| `io_error`                | input / output stream or underlying storage read/write failure                                                               |
| `storage_full`            | disk space or storage quota exhausted                                                                                        |
| `lock_timeout`            | timed out waiting for the consistency lock (e.g. calling backup inside a transaction callback)                               |
| `invalid_state`           | adapter not connected, shutting down, or otherwise unable to execute the operation                                           |

## Related pages

- [Adapter overview](/adapters/README.md) — selection and division of labor across adapters
- [SQLite](/adapters/sqlite.md) / [SQLite WASM](/adapters/sqlite-wasm.md) / [SQLiteAI](/adapters/sqliteai.md) — the SQLite-family adapters
- [PGlite](/adapters/pglite.md) — the PGlite adapter
- [Field encryption](/adapters/encrypted.md) — backup / restore semantics of encrypted databases (ciphertext round-trip, auth domain)

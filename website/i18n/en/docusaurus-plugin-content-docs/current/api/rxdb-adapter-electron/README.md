# rxdb-adapter-electron

RxDB adapter that stores data in **real files inside the Electron app's private directory**. This package provides two side-by-side adapters that can be registered at the same time:

| Adapter name      | On-disk shape                | Entry points                                            |
| ----------------- | ---------------------------- | ------------------------------------------------------- |
| `sqlite-electron` | A single `.sqlite3` file     | `.` (renderer) + `/host` (privileged side)              |
| `pglite-electron` | A PGlite data directory tree | `/pglite` (renderer) + `/pglite-host` (privileged side) |

Data is read and written directly by the privileged side (the Electron main process or a worker it owns) — SQLite via `node:sqlite`, PGlite via the Node filesystem backend of `@electric-sql/pglite`. The renderer process only sends protocol requests over a narrow transport layer, so it gets neither filesystem handles nor physical paths.

For Tauri, use [`@aiao/rxdb-adapter-tauri`](https://www.npmjs.com/package/@aiao/rxdb-adapter-tauri) instead: the two packages share the same protocol and renderer client implementation (in `@aiao/rxdb-adapter-sqlite-core/desktop-host`); the only difference is whether the privileged side is `node:sqlite` or Rust.

## Features

- **Real file persistence**: data lives in the app data directory (a `.sqlite3` file for SQLite, a data directory tree for PGlite), survives restarts, and does not depend on browser storage quotas
- **Zero filesystem privileges for the renderer**: works as usual under `contextIsolation: true` + `sandbox: true`
- **Multi-window safety**: the two families take different approaches, and they **behave differently** — see [Multi-window and transactions](#multi-window-and-transactions) below
- **No fallback**: unsupported storage configurations throw immediately; never silently falls back to memory/OPFS/IndexedDB
- **Reuses the engine core**: queries, transactions, and branch switching come from `@aiao/rxdb-adapter-sqlite-core` / `@aiao/rxdb-adapter-pglite`, with the same semantics and the same test suites as their respective browser tiers

## When to use

- The Electron app needs local data that "the user can see, back up, and only an uninstall removes"
- The data volume exceeds the comfort zone of browser storage quotas, or you cannot accept the risk of OPFS being evicted by the browser
- You need external tools to open the same data directly (SQLite: the `sqlite3` CLI, DB Browser)

Choosing between the two families: default to `sqlite-electron` — a single file, easy for external tools, and its only dependency is built into Node. Pick `pglite-electron` only when you need PostgreSQL's types and SQL dialect (JSONB, relational constraints) or cross-window change events (`LISTEN`/`NOTIFY`, see [Multi-window and transactions](#multi-window-and-transactions) below), at the cost of tens of megabytes of WASM and one worker thread.

> **Full-text search is not available in either family yet**: the allowlist in `@aiao/rxdb-plugin-search` only contains in-browser engines (`sqlite-wasm` / `sqlite` / `sqliteai` / `pglite`). Neither desktop adapter name is in that list, so `createRxDatabase` throws `SearchUnsupportedAdapterError` — no fallback, no `.search` attached.

For running inside a browser, use [`@aiao/rxdb-adapter-wa-sqlite`](https://www.npmjs.com/package/@aiao/rxdb-adapter-wa-sqlite) or [`@aiao/rxdb-adapter-sqlite-wasm`](https://www.npmjs.com/package/@aiao/rxdb-adapter-sqlite-wasm) instead.

## Capability matrix

| Storage               | Status                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Single-file SQLite    | ✅ host ships in the package (`/host`), adapter name `sqlite-electron`                                                            |
| PGlite data directory | ✅ host ships in the package (`/pglite-host`), adapter name `pglite-electron`; requires optional peers (see "Installation" below) |

The two families speak **two different protocols** (SQLite-side `sqlite.*`, PGlite-side `pg.*`), not one protocol with two backends: PGlite's callback transactions cannot cross IPC, so it uses an explicit transaction-ID protocol instead (`begin` / `query` / `commit` / `rollback`, with the same transaction ID bound to the same physical connection). That is why `pglite-electron` is **deliberately absent** from the `DesktopHostAdapterName` registry — that registry is the list of things "speaking the SQLite host protocol", and shoehorning it in would make the shared layer believe it accepts `DesktopSqliteFileStorage`.

Combinations outside the matrix are rejected by `assertDesktopSqliteStorage` with `unsupported_runtime_engine` — no silent degradation.

The host side needs a Node runtime: the SQLite side needs the built-in `node:sqlite`, and the PGlite side needs to be able to load `@electric-sql/pglite`. This package is verified on Node 26 and Electron 43; earlier versions are unverified.

## Installation

```bash
npm install @aiao/rxdb-adapter-electron
# or
pnpm add @aiao/rxdb-adapter-electron
```

If you only use SQLite, installing this far is enough. **Only if you use PGlite** do you need two more optional peers:

```bash
pnpm add @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

Both are declared as `optional: true` peers precisely so that SQLite-only apps do not have to install PGlite — which is also why the four entry points below must be separate.

## Four entry points

The package is **deliberately** split into four entry points; do not mix them. The split is two orthogonal lines: **renderer / privileged side** (who can touch the filesystem) × **SQLite / PGlite** (which optional peer gets pulled in).

| Entry point                               | Loaded where                             | Heavy dependency pulled in                          |
| ----------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `@aiao/rxdb-adapter-electron`             | renderer (browser context)               | none, safe to bundle                                |
| `@aiao/rxdb-adapter-electron/host`        | Electron main process / a worker it owns | `node:sqlite`                                       |
| `@aiao/rxdb-adapter-electron/pglite`      | renderer (browser context)               | only `@aiao/rxdb-adapter-pglite` + types, see below |
| `@aiao/rxdb-adapter-electron/pglite-host` | Electron main process / a worker it owns | `@electric-sql/pglite` (full PostgreSQL WASM)       |

Bundling any host entry into the renderer bundle is equivalent to handing filesystem capabilities back to the renderer process — the whole isolation is void.

> The `/pglite` renderer entry **does not reference the PostgreSQL runtime**: the WASM instance lives on the privileged side; the renderer side is only a protocol proxy, and the only things taken from `@electric-sql/pglite` are types and the roughly 2 KB template compilation subpath `/template`. So using PGlite does not add tens of megabytes to the renderer bundle.

## Usage

Wiring has three places.

### 1. Main process: start the host

```typescript
import { createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { app, ipcMain, type WebContents } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(app.getPath('userData'), 'rxdb-data');

// sessionId → the window the session belongs to. The open response carries the sessionId,
// and change events are routed back by it.
const targets = new Map<string, WebContents>();

const host = createElectronSqliteHost({
  // Only the host app knows its own data directory. The incoming name has already passed
  // whitelist validation and contains no path separators.
  resolveDatabasePath: databaseName => {
    mkdirSync(root, { recursive: true });
    return join(root, databaseName);
  },
  postChange: message => {
    const target = targets.get(message.sessionId);
    // The window is gone: the write was already committed, and the event has nowhere to go.
    // This is a routine race, not a failure.
    if (!target || target.isDestroyed()) return;
    target.send('desktop-sqlite:change', message);
  },
  onDeliveryError: error => console.warn('[desktop-sqlite] change event delivery failed', error)
});

// host.handle never rejects: failures come back as `kind: 'error'` responses.
// ipcRenderer.invoke flattens errors into strings on rejection, losing custom error codes along the way.
ipcMain.handle('desktop-sqlite:request', async (event, payload: unknown) => {
  const response = await host.handle(payload);
  if (response.kind === 'open') targets.set(response.result.sessionId, event.sender);
  return response;
});

app.on('before-quit', () => host.closeAll());
```

Session reclamation (closing a window's unclosed sessions when it is `destroyed`) is a bit more verbose than the snippet above; see `desktop-sqlite-bridge.ts` in the examples at the end for the full implementation.

### 2. preload: expose the transport

The transport has only two methods, so the renderer does not get the raw `ipcRenderer` and cannot send messages on arbitrary channels.

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Must match the adapter's DESKTOP_HOST_TRANSPORT_KEY character for character.
contextBridge.exposeInMainWorld('__aiaoRxdbDesktopHost__', {
  request: (payload: unknown) => ipcRenderer.invoke('desktop-sqlite:request', payload),
  subscribe: (listener: (message: unknown) => void) => {
    // Forward only the message body: IpcRendererEvent carries the sender, and handing it to
    // the renderer means handing over the channel capability as well.
    const forward = (_event: IpcRendererEvent, message: unknown): void => listener(message);
    ipcRenderer.on('desktop-sqlite:change', forward);
    return () => ipcRenderer.removeListener('desktop-sqlite:change', forward);
  }
});
```

### 3. renderer: use it like any other adapter

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: `{ type: SyncType.None, local: { adapter: ELECTRON_ADAPTER_NAME } }`
});

// No transport passed: the adapter looks up the bridge exposed by preload on the global key itself.
rxdb.adapter(ELECTRON_ADAPTER_NAME, async database => new RxDBAdapterElectron(database));
rxdb.init();
await rxdb.connect(ELECTRON_ADAPTER_NAME);

// Hand the connection back to the host when the component/window is destroyed,
// otherwise the session has to wait until the window 'destroyed' for reclamation.
await rxdb.disconnectAll();
```

### Swapping in PGlite

On the renderer side only two names change; everything else is character-for-character identical — the transport, the preload, and the error contract are shared by both families:

```typescript
import { ELECTRON_PGLITE_ADAPTER_NAME, RxDBAdapterElectronPGlite } from '@aiao/rxdb-adapter-electron/pglite';

rxdb.adapter(
  ELECTRON_PGLITE_ADAPTER_NAME,
  async database => new RxDBAdapterElectronPGlite(database, { dataDirectoryName: 'demo-pgdata' })
);
```

On the privileged side, swap in `createElectronPgliteHost` (from `/pglite-host`) and put it in a worker as described above under "Do not put the PGlite host on the main thread". Both adapters can be registered on the same `RxDB` instance at the same time — different names, different protocols.

#### Dispatching over a shared IPC channel

There is no need to open a new channel for PGlite: one `request` / `subscribe` pair suffices, and the main process dispatches to the three host families (SQLite / file / PGlite) by the request's `kind`. **The order must not be reversed** —

```typescript
// 1. Closed-set guard first: unknown kinds are rejected before any host is touched
if (!isKnownDesktopHostRequestKind(request)) {
  return Promise.resolve({ kind: 'error', code: 'protocol_violation', message: '...' });
}
// 2. Then dispatch; SQLite can only be the last resort
const kind = readDesktopHostRequestKind(request);
if (isDesktopHostFileRequestKind(kind)) return file.handle(target, request);
if (isDesktopPgliteRequestKind(kind)) return pglite.handle(target, request);
return sqlite.handle(target, request);
```

The SQLite branch is the **fallback branch** (anything that is "not handshake/open/version/close/mute" is treated as `execute`), so misjudging one family does not produce an error — instead a PGlite request gets run down the SQL path once. Both layers are therefore needed: for dispatch, use the protocol packages' exported `isDesktopPgliteRequestKind` (`/pglite-host`) and `isDesktopHostFileRequestKind` (`/host`) rather than maintaining your own `kind` list at the wiring site — that list would inevitably drift with protocol versions. The closed-set guard is a few lines on the app side (the protocol does not export a SQLite-family predicate); it keeps kinds outside the three families away from the fallback branch.

> Bringing PGlite in does not make SQLite-only sessions heavier: the PGlite channel factory in the example is **lazily invoked** — without a `pg.*` request, that worker thread never starts and PostgreSQL WASM is never loaded.

See `desktop-host-bridge.ts` and `desktop-host-request-guard.ts` in the examples at the end for the full implementation.

## The logical database name is not a path

`databaseName` is a **logical name within the app's scope**. The renderer neither knows nor needs to know the physical root directory.

When omitted, it is derived as `${rxdb.config.dbName}.sqlite3`; the PGlite-side counterpart is `dataDirectoryName`, derived as `${rxdb.config.dbName}-pgdata` when omitted (what lands on disk is the **directory tree** produced by initdb, not a single file — naming it with a file extension like `.db` would only mislead operators). Specify it explicitly only when taking over an existing database, or when several RxDB instances share the same file.

The allowed set is a whitelist `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/` (≤ 128 characters), not a blacklist: the character set contains no `/`, `\`, or `:`, and does not allow a leading `.`, so `..`, absolute paths, drive letters, `~` expansion, and URL schemes all fall outside the set — no need to enumerate attack shapes one by one. Violations throw `invalid_database_name`.

> The name comes from the renderer and is **untrusted** even with `contextIsolation`. The host side validates it again; in the host app's `resolveDatabasePath`, it is recommended to call `assertValidDesktopDatabaseName` once more before `mkdir` — invalid input should leave no trace on disk.

## ⚠️ Do not name the database directory `databases`

When picking a subdirectory name under Electron's `userData`, **avoid `databases`**: that is Chromium's own WebSQL directory, and its storage layer deletes every unregistered file in the directory at startup — your database files are exactly the "unregistered" ones.

Measured (packaged build, macOS, the same `--user-data-dir` opened twice in a row): data written during the first launch was wiped entirely during the second launch, with **no error at any point** — the app showed connected as usual and wrote as usual, only the previous data was gone. A sibling `rxdb-data/` directory at the same level was untouched.

## Error codes

Program branches should read `error.code`, not match message text (messages start with a `[code] ` prefix, purely for log search convenience). The original cause is passed through as-is via `cause`.

| code                         | Meaning                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupported_runtime_engine` | The storage `engine` is outside the capability matrix (e.g. handing a PGlite data directory to the SQLite protocol)                                       |
| `invalid_database_name`      | The logical database name is invalid, or tries to escape the app's scope                                                                                  |
| `host_unavailable`           | The renderer cannot reach the host (no transport injected / preload not exposing one)                                                                     |
| `session_closed`             | The session is used after being disconnected                                                                                                              |
| `protocol_violation`         | A request or response does not match the protocol shape                                                                                                   |
| `open_failed`                | Opening the database failed; `cause` preserves the original reason                                                                                        |
| `permission_denied`          | The path has no permission, or the statement is rejected by the SQLite authorizer (`ATTACH` / `VACUUM INTO` etc.)                                         |
| `database_corrupted`         | The target file is not a usable SQLite database                                                                                                           |
| `statement_failed`           | The SQL itself failed to execute (syntax, constraints, etc.)                                                                                              |
| `host_internal_error`        | The host itself failed; a defect rather than a caller problem                                                                                             |
| `database_busy`              | Another connection (usually another window) holds a conflicting lock; retrying works, no data is lost                                                     |
| `file_not_found`             | The target file or directory does not exist; the renderer side restores this into `NotFoundError`                                                         |
| `invalid_file_path`          | The path escapes the storage root, or points to a type that does not match the operation                                                                  |
| `disk_full`                  | Disk space or quota exhausted (ENOSPC / EDQUOT)                                                                                                           |
| `write_aborted`              | The write token is no longer valid (session closed, committed, or discarded); the target keeps its pre-write content                                      |
| `transaction_not_found`      | The transaction ID is unknown, has ended, or does not belong to this session; not a single statement of that transaction was executed                     |
| `transaction_unavailable`    | Could not get a PGlite connection (another transaction still holds it), or the `begin` that opened the transaction timed out                              |
| `restore_in_progress`        | The target is exclusively held by a restore on the same host; ordinary connections are refused; new restores and cleanups report `database_busy` as usual |
| `restore_incomplete`         | The target has a marker of an unfinished restore; it must be cleaned up before connecting or restoring again                                              |
| `target_not_empty`           | The restore target already contains database content; restore refuses to overwrite                                                                        |
| `cleanup_pending`            | The cleanup after a failed restore itself failed; the target stays in a discernible unfinished state                                                      |
| `unsupported_operation`      | The host does not have the operation enabled, e.g. `backup` was not passed when creating the PGlite host                                                  |

`file_not_found` / `invalid_file_path` / `disk_full` / `write_aborted` come from the file host (`createElectronFileHost`, used by `@aiao/rxdb-plugin-storage/desktop`); the SQLite side does not use them.

`transaction_not_found` / `transaction_unavailable` appear only on the PGlite path: PGlite transactions chain multiple IPC round-trips via explicit transaction IDs; the SQLite side has no such concept. The timeout budget for `transaction_unavailable` comes from `DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS`, capped at `DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS`.

The last five codes come from the PGlite host's backup and restore (US-217), and likewise appear only on the PGlite path; of these, `restore_in_progress` also lands on connection attempts to the same host during a restore. Backup, restore, and cleanup themselves do not throw them verbatim at callers — they normalize into `RxDBBackupError`; see "Backup and restore → PGlite" for the mapping.

Error codes are **part of the contract**: new ones may only be appended, never reused or redefined.

The `RxDBAdapterDesktopError` class cannot cross structured clone, so host-side errors come back to the renderer as `{ kind: 'error', code, message }` and the adapter re-throws them as `RxDBAdapterDesktopError` per the contract — callers still write ordinary `try/catch` and never notice the IPC in between. Codes outside the contract are always treated as `protocol_violation`, never surfaced verbatim as error codes.

## Multi-window and transactions

**The two families behave differently in this section** — this is the easiest difference to trip over when choosing:

| Dimension            | `sqlite-electron`                                  | `pglite-electron`                                                                    |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Connection model     | One independent connection per `open`              | One **shared instance** per data directory, reused across sessions                   |
| Concurrent writes    | SQLite file lock + backoff retry → `database_busy` | Transactions queue on the single connection → timeout with `transaction_unavailable` |
| Cross-window changes | ❌ not cross-window (see below)                    | ✅ cross-window, `NOTIFY` fans out to all sessions of the instance                   |

### SQLite: `BEGIN IMMEDIATE` and lock-collision retries

Transactions use `BEGIN IMMEDIATE` rather than a bare `BEGIN`: the latter defers lock acquisition — the write lock is only taken at the first write statement of the transaction, so a lock collision happens **mid-transaction** — by then a snapshot has already been read and SQLite requires the whole transaction to roll back and start over. `IMMEDIATE` moves lock acquisition to the start: on collision the transaction has not opened yet, so retrying is just sending the request again with no side effects.

After a collision it retries with exponential backoff; the default total budget is 5 seconds (covering the longest lock hold: "another window is running a system schema migration"), then it reports `database_busy`. Adjustable via the host's `busyRetryBudgetMs`.

#### Change events do not cross windows

Each `open` gets its own **independent** `DatabaseSync` connection — a shared connection would let multiple windows' `BEGIN` blocks interleave, and transaction isolation would break outright. The cost is that change notifications only fire on the connection the write happened on: notifications are implemented with TEMP triggers, and TEMP objects are private to a connection.

So **a write from window A does not trigger window B's reactive queries**. The data itself is consistent (same file, guaranteed by SQLite's locking); what is inconsistent is only "when B finds out" — B has to wait until its next query to see the new data.

If cross-window realtime sync is needed, the host app has to broadcast it itself for now (e.g. the main process forwards the events received by `postChange` to the remaining `webContents`, and each renderer re-queries proactively upon receipt).

### PGlite: single instance + transaction IDs

A PGlite data directory **does not support being opened by two instances concurrently**, so the host reuses a single instance per data directory name: when a second window opens the same directory, it gets the same instance, not a second one. This is both necessary and a free fix for the SQLite side's cross-window notification problem — `LISTEN` is subscribed **once** at instance creation (subscribing once per session would make one `NOTIFY` invoke the callback multiple times), and notifications fan out to all sessions under that instance, so **a write from window A triggers window B's reactive queries**.

The cost lands on transactions: all transactions queue for the single connection. If `begin` cannot get the connection, it reports `transaction_unavailable` rather than waiting forever — waiting forever would make the scene look like "the database is not responding". Transaction IDs are random UUIDs bound to a session; mismatched ownership is always `transaction_not_found`.

When a window crashes or closes, all in-flight transactions under that session are rolled back and released (`releaseOwner` is attached to `render-process-gone` and window `destroyed`), leaving no dangling transactions.

#### Do not put the PGlite host on the main thread

PGlite's WASM runs an entire query **synchronously on the calling thread**: measured, a 2-second query blocked the main process for 2007 milliseconds — windows did not repaint, menus did not respond, all IPC queued up. "The main process holds the single instance" and "the main process must not be blocked" therefore cannot both hold; the single instance has to move to its own thread.

And the move must take the **whole host** with it, not just PGlite: `ElectronPgliteRuntime.transaction` takes a callback, and the callback cannot cross the thread boundary (for the same reason it cannot cross the IPC boundary). Once the host moves, only pure data like `DesktopPgliteRequest` / `DesktopPgliteResponse` flows across the thread boundary. See the example below.

## Backup and restore

Both families can write an entire database as a `.rxdb-backup` archive stream and restore it into an **empty, unconnected** target. Both ends stream block by block and never read the whole database into memory; compatibility is decided before the first byte is written to the target; failures always throw a discernible `RxDBBackupError` (branch on `error.code`; `isRxDBBackupError()` narrows the type) and never report success.

> **External files are out of backup scope.** The archive contains only the database itself; the result and the manifest's `scope` are always `{ database: 'included', externalFiles: 'excluded' }`. Files placed by `@aiao/rxdb-plugin-storage/desktop` in the file host's root directory must be backed up and restored separately.

Input and output streams are provided by the caller (`ReadableStream<Uint8Array>` / `WritableStream<Uint8Array>`): this package does not pop a file picker, nor does it authorize arbitrary paths for the renderer. Where to write and where to read from is decided by the host app — e.g. expose a channel in preload that can only read and write the app's backup directory.

| Family | Backup                 | Restore                                                                   | Cleanup of incomplete restore                    |
| ------ | ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| SQLite | `adapter.backup(sink)` | `adapter.restore(source)`: adapter registered, instance not yet connected | `adapter.cleanupIncompleteRestore()`             |
| PGlite | `adapter.backup(sink)` | `restoreElectronPGliteDatabase(source, target)`                           | `cleanupIncompleteElectronPGliteRestore(target)` |

Archives only restore into the **same adapter**: a `sqlite-electron` archive cannot restore into `sqlite-tauri` or in-browser SQLite, and a `pglite-electron` archive cannot restore into browser PGlite, and vice versa — all report `incompatible_archive`.

### SQLite

The implementation is shared with the four browser-side SQLite adapters; for the archive format, compatibility checks, interruption and cleanup semantics see ["Backup and restore" of `@aiao/rxdb-adapter-sqlite-core`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-sqlite-core#备份与恢复). The desktop side adds only three things:

- **WAL**: the database file runs in WAL mode. Backup is a logical dump inside a read transaction; data committed before the snapshot boundary but not yet checkpointed into the main file is in the archive too — no "copied only the main file, missed the WAL".
- **Exclusive access**: the same database file may be open in other windows or other processes, and Web Locks cannot stop them. Before checking whether the target is empty, restore and cleanup make their own connection take SQLite's file-level exclusive lock and hold it until the restore completes or the failed-cleanup ends. If the database file is open on any other connection at that moment, it reports `target_busy` (`details.field` is `storage`); other processes also cannot open it during the restore — connections Web Locks cannot reach report `database_busy` immediately at initialization.
- **FTS5**: the host runs SQLite in defensive mode and cannot modify a virtual table's shadow tables. Backing up or restoring databases containing virtual tables such as FTS5 reports `unsupported_combination` — it will not produce an archive it cannot restore itself.

```typescript
// Backup: the sink is provided by the host app
const adapter = await rxdb.getAdapter(ELECTRON_ADAPTER_NAME);
const result = await adapter.backup(sink);

// Restore: the target has the adapter registered but has not connected yet
const restored = await target.getAdapter(ELECTRON_ADAPTER_NAME);
await restored.restore(source);
await target.connect(ELECTRON_ADAPTER_NAME);
```

> Wire protocol v2 added new request kinds for backup and restore: the SQLite family's `mute` (mute change events during restore writes) and the PGlite family's `pg.engine`, `pg.backup.*`, and `pg.restore.*` (as defined by the protocol package's `isDesktopPgliteRequestKind`). If the host app maintains its own closed-set guard of request kinds as in "Dispatching over a shared IPC channel" (the example app has one copy in the main process and one in the preload), each copy must be extended — otherwise the guard rejects the requests with `protocol_violation`: SQLite restore reports `io_error` before writing to the target, with that `protocol_violation` as its `cause`; PGlite backup and restore report `unsupported_combination` (`details.field` is `protocolVersion`).

### PGlite

The privileged side must opt in explicitly: without passing `backup` to `createElectronPgliteHost`, the host only serves connections, and backup/restore requests all report `unsupported_operation` — surfacing on the renderer side as `unsupported_combination`.

```typescript
import { createElectronPgliteHost } from '@aiao/rxdb-adapter-electron/pglite-host';
import { PGlite } from '@electric-sql/pglite';
import { join } from 'node:path';

const dataDirectoryOf = (name: string): string => join(root, name);

const host = createElectronPgliteHost({
  createRuntime: async name => new PGlite(dataDirectoryOf(name)),
  postNotify: message => port.postMessage({ op: 'notify', message }),
  backup: {
    // Must be the exact directory createRuntime opens for the same name
    resolveDataDirectory: dataDirectoryOf,
    // A non-persistent probe used to answer engine versions;
    // same PGlite and same extensions as createRuntime
    createProbeRuntime: async () => new PGlite(),
    // Extensions that affect data compatibility; pass an empty array if there are none
    extensions: []
  }
});
```

On the renderer side, backup lives on the adapter; the restore target is not connected yet and has no adapter to call, so restore and cleanup are two functions exported from the `/pglite` entry:

```typescript
import {
  ELECTRON_PGLITE_ADAPTER_NAME,
  RxDBAdapterElectronPGlite,
  restoreElectronPGliteDatabase
} from '@aiao/rxdb-adapter-electron/pglite';

// Backup
const result = await adapter.backup(sink);

// Restore: options must be exactly what is handed to the adapter when connecting later;
// the data directory name and transport are both decided from it
const restoreTarget = { rxdb: target, options: { dataDirectoryName: 'restored-pgdata' } };
await restoreElectronPGliteDatabase(source, restoreTarget);
target.adapter(ELECTRON_PGLITE_ADAPTER_NAME, async db => new RxDBAdapterElectronPGlite(db, restoreTarget.options));
await target.connect(ELECTRON_PGLITE_ADAPTER_NAME);
```

Key points:

- **Consistency**: the snapshot is taken by the host, which suspends an empty transaction on the session's single connection and runs `CHECKPOINT`; other windows cannot modify the files while writing, and the archive corresponds to a committed transaction boundary. The cap on waiting for the connection to idle is the adapter's `beginTimeout`; if another window holds a transaction for a long time, it reports `lock_timeout`.
- **Memory**: data chunks are at most 64 KiB — one chunk per IPC message, pulled chunk by chunk at the renderer's reading pace, no read-ahead on the host. When the output stream exerts backpressure, the whole pipeline pauses; memory usage is independent of database size.
- **Exclusive access**: once `backup` is enabled, every data directory has a cross-process directory lock next to it — hosts in other processes included. Only one concurrent restore on the same directory can win (`target_busy`); during a restore, connection attempts on the same host report `restore_in_progress`, and hosts in other processes report `database_busy`.
- **Validate before writing**: the adapter, PostgreSQL major version, extensions (the target host must provide all of them), system table and change encoding versions, entity structure fingerprint, and encryption auth domain are all decided before writing (`incompatible_archive` / `auth_domain_mismatch`). When the host's and renderer's wire protocol versions differ, it reports `unsupported_combination` before touching the target (`details.field` is `protocolVersion`).
- **Interruption**: the host persists an incomplete marker before writing the first file and removes it only after integrity verification, startup validation, and per-file fsync all pass. If the window or process exits mid-restore, connections and further restores report `restore_incomplete`; after `cleanupIncompleteElectronPGliteRestore(target)`, restoring can resume. If cleanup fails, it reports `cleanup_pending`. Cleanup only removes marked directories — a healthy database is never deleted by it.
- **Encrypted databases**: encryption and decryption happen in the renderer; the host only handles ciphertext. The archive contains only ciphertext and keyring metadata, no passphrases or keys; the restored database stays locked — `unlock()` it with the original passphrase.
- **Errors**: host desktop error codes never leak to callers; everything normalizes into `RxDBBackupError` with the original error in `cause`: `database_busy` → `target_busy`; `restore_in_progress` / `restore_incomplete` / `target_not_empty` / `cleanup_pending` → same-named codes (these four, together with `target_busy`, describe the directory's state at that moment; `details.field` is `dataDirectoryName`); `protocol_violation` → `unsupported_combination` (`details.field` is `protocolVersion`); `unsupported_operation` / `unsupported_runtime_engine` / `invalid_database_name` → `unsupported_combination`; `disk_full` → `storage_full`; `transaction_unavailable` → `lock_timeout`; `session_closed` → `invalid_state`; `database_corrupted` is `corrupt_archive` during restore and `io_error` during backup; everything else → `io_error`.

### When the output stream reports "disk full"

`ipcRenderer.invoke` flattens errors into a message on rejection, so fields like `code: 'ENOSPC'` cannot cross IPC. When an output stream writing files over IPC hits a full disk or exhausted quota, reject it on the renderer side with `new DOMException(message, 'QuotaExceededError')` so that backup reports `storage_full` instead of a generic `io_error`.

## Complete examples

See [dev-rxdb-electron](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron):

- **SQLite**: `src-electron/desktop-sqlite-bridge.ts` (main-process wiring and window ownership)
- **PGlite**: `src-electron/desktop-pglite-bridge.ts` + `src-electron/desktop-pglite-worker.ts` — **the whole host, WASM included, runs in a worker thread**; the bridge only does ownership bookkeeping and forwarding
- Shared by both families: `src-electron/preload.ts` (bridge exposure), `src/app/services/desktop-database.service.ts` (renderer-side usage)

> The three directory roots **must be pairwise distinct**: the PGlite data directory is a tree that gets deleted/rebuilt wholesale; mixing SQLite database files or user files one level into it means one rebuild deletes them along with it.

The **renderer-side** entry point of `@aiao/rxdb-adapter-electron`.

## Remarks

This entry contains only what is needed to talk across the transport; it does **not reference `node:sqlite`**, so it is safe to bundle into a browser-context renderer bundle. For the privileged side (the Electron main process or a worker it owns), use `@aiao/rxdb-adapter-electron/host` instead.

The **implementation** of the protocol, renderer client, storage union, and error types has moved down into `@aiao/rxdb-adapter-sqlite-core/desktop-host` (US-207 E1), shared by the two desktop runtimes. This entry re-exports them as-is: downstream imports by name, and an implementation moving between packages should not force users to change a line.

## Classes

| Class                                                         | Description                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [DesktopSqliteClient](classes/DesktopSqliteClient.md)         | Client for accessing a local SQLite file through the desktop host.          |
| [RxDBAdapterDesktopError](classes/RxDBAdapterDesktopError.md) | Desktop adapter error.                                                      |
| [RxDBAdapterElectron](classes/RxDBAdapterElectron.md)         | Connects RxDB to real SQLite files in the Electron app's private directory. |

## Interfaces

| Interface                                                                    | Description                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [DesktopHostChangeEventMessage](interfaces/DesktopHostChangeEventMessage.md) | Change events the host pushes to the renderer on its own initiative.                                    |
| [DesktopHostCloseRequest](interfaces/DesktopHostCloseRequest.md)             | Closes a session and releases the database handle.                                                      |
| [DesktopHostExecuteRequest](interfaces/DesktopHostExecuteRequest.md)         | Executes SQL on an opened session.                                                                      |
| [DesktopHostFileEntry](interfaces/DesktopHostFileEntry.md)                   | Directory entry: only name and type, no physical path leaked.                                           |
| [DesktopHostFileReadResult](interfaces/DesktopHostFileReadResult.md)         | One frame of a `file.read` result.                                                                      |
| [DesktopHostFileStat](interfaces/DesktopHostFileStat.md)                     | Metadata of a single path; expressed as `null` rather than an error when the target does not exist.     |
| [DesktopHostHandshakeRequest](interfaces/DesktopHostHandshakeRequest.md)     | Negotiates the wire protocol version.                                                                   |
| [DesktopHostHandshakeResult](interfaces/DesktopHostHandshakeResult.md)       | Response to a `handshake` request.                                                                      |
| [DesktopHostMuteRequest](interfaces/DesktopHostMuteRequest.md)               | Pauses / resumes change event collection for a session (protocol v2).                                   |
| [DesktopHostOpenRequest](interfaces/DesktopHostOpenRequest.md)               | Opens a database session.                                                                               |
| [DesktopHostOpenResult](interfaces/DesktopHostOpenResult.md)                 | Response to an `open` request.                                                                          |
| [DesktopHostTransport](interfaces/DesktopHostTransport.md)                   | Transport layer between the renderer and the host.                                                      |
| [DesktopHostVersionRequest](interfaces/DesktopHostVersionRequest.md)         | Queries the engine version of the database the session is connected to.                                 |
| [DesktopOptions](interfaces/DesktopOptions.md)                               | Desktop adapter options.                                                                                |
| [DesktopPgliteDirectoryStorage](interfaces/DesktopPgliteDirectoryStorage.md) | PGlite data directory desktop storage.                                                                  |
| [DesktopSqliteClientOptions](interfaces/DesktopSqliteClientOptions.md)       | Optional behavior parameters for [DesktopSqliteClient.connect](classes/DesktopSqliteClient.md#connect). |
| [DesktopSqliteFileStorage](interfaces/DesktopSqliteFileStorage.md)           | Single-file SQLite desktop storage.                                                                     |

## Type Aliases

| Type Alias                                                                 | Description                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [DesktopHostFileLockMode](type-aliases/DesktopHostFileLockMode.md)         | Lock mode, matching Web Locks' same-named values.                                         |
| [DesktopHostFileRequest](type-aliases/DesktopHostFileRequest.md)           | All requests the renderer can send to the file host.                                      |
| [DesktopHostFileResponse](type-aliases/DesktopHostFileResponse.md)         | The host's response to a file request; failures also travel through normal return values. |
| [DesktopHostRequest](type-aliases/DesktopHostRequest.md)                   | All requests the renderer can send to the host.                                           |
| [DesktopHostResponse](type-aliases/DesktopHostResponse.md)                 | The host's response to a request.                                                         |
| [DesktopStorage](type-aliases/DesktopStorage.md)                           | Discriminated union of desktop storage configurations, distinguished by `engine`.         |
| [RxDBAdapterDesktopErrorCode](type-aliases/RxDBAdapterDesktopErrorCode.md) | Stable error codes the desktop adapter commits to externally.                             |

## Variables

| Variable                                                                                 | Description                                                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [DESKTOP\_DEFAULT\_DATABASE\_SUFFIX](variables/DESKTOP_DEFAULT_DATABASE_SUFFIX.md)       | Suffix appended when deriving the logical file name from the RxDB database name.  |
| [DESKTOP\_HOST\_MAX\_BINDINGS](variables/DESKTOP_HOST_MAX_BINDINGS.md)                   | Maximum number of binding parameters allowed per request.                         |
| [DESKTOP\_HOST\_MAX\_BLOB\_BYTES](variables/DESKTOP_HOST_MAX_BLOB_BYTES.md)              | Byte cap for a single blob binding parameter.                                     |
| [DESKTOP\_HOST\_MAX\_FILE\_CHUNK\_BYTES](variables/DESKTOP_HOST_MAX_FILE_CHUNK_BYTES.md) | Byte cap for a single frame of file read/write.                                   |
| [DESKTOP\_HOST\_MAX\_SQL\_LENGTH](variables/DESKTOP_HOST_MAX_SQL_LENGTH.md)              | Length cap for a single SQL text on the SQLite wire protocol (UTF-16 code units). |
| [DESKTOP\_HOST\_PROTOCOL\_VERSION](variables/DESKTOP_HOST_PROTOCOL_VERSION.md)           | Wire protocol version.                                                            |
| [DESKTOP\_HOST\_TRANSPORT\_KEY](variables/DESKTOP_HOST_TRANSPORT_KEY.md)                 | Key the preload uses when mounting the transport on the renderer's global scope.  |
| [ELECTRON\_ADAPTER\_NAME](variables/ELECTRON_ADAPTER_NAME.md)                            | The adapter's name in the `RxDBAdapters` registry.                                |

## Functions

| Function                                                                        | Description                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [assertDesktopHostResponse](functions/assertDesktopHostResponse.md)             | Validates a host response and converts error responses back into local exceptions.                             |
| [assertDesktopSqliteStorage](functions/assertDesktopSqliteStorage.md)           | Validates that the storage configuration is exactly the one engine this protocol carries — single-file SQLite. |
| [assertValidDesktopDatabaseName](functions/assertValidDesktopDatabaseName.md)   | Validates the logical database name.                                                                           |
| [isDesktopPgliteDirectoryStorage](functions/isDesktopPgliteDirectoryStorage.md) | Checks whether a storage configuration has the PGlite data directory shape.                                    |
| [isDesktopSqliteFileStorage](functions/isDesktopSqliteFileStorage.md)           | Checks whether a storage configuration has the single-file SQLite shape.                                       |
| [parseDesktopHostChangeEvent](functions/parseDesktopHostChangeEvent.md)         | Validates a change event pushed by the host.                                                                   |
| [parseDesktopHostHandshakeResult](functions/parseDesktopHostHandshakeResult.md) | Validates a `handshake` response.                                                                              |
| [parseDesktopHostOpenResult](functions/parseDesktopHostOpenResult.md)           | Validates an `open` response.                                                                                  |
| [resolveDesktopHostTransport](functions/resolveDesktopHostTransport.md)         | Reads the transport injected by preload.                                                                       |

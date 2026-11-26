# Electron adapter

`@aiao/rxdb-adapter-electron` lands data in **real files inside the Electron app's private directory**: data is read and written directly by the privileged side (the Electron main process or a worker it owns), and the renderer only sends protocol requests over one narrow transport — so it gets neither file system handles nor physical paths. It works under `contextIsolation: true` + `sandbox: true`, does not depend on browser storage quotas, and never falls back to memory/OPFS/IndexedDB.

## Two adapter families and how to choose

This package provides two sibling adapters that can be **registered on the same `RxDB` instance at the same time** (different names, different protocols):

| adapter name      | on-disk shape            | privileged-side engine        | entry                                                   |
| ----------------- | ------------------------ | ----------------------------- | ------------------------------------------------------- |
| `sqlite-electron` | a single `.sqlite3` file | `node:sqlite` (Node built-in) | `.` (renderer) + `/host` (privileged side)              |
| `pglite-electron` | a PGlite data directory  | `@electric-sql/pglite` (WASM) | `/pglite` (renderer) + `/pglite-host` (privileged side) |

The two families run **two protocols** (`sqlite.*` on the SQLite side, `pg.*` on the PGlite side), not two backends of one protocol.

**How to choose**: default to `sqlite-electron` — a single file, easy to wire into external tools (`sqlite3` CLI, DB Browser), with only Node built-ins as a dependency. Choose `pglite-electron` when you need PostgreSQL types and SQL dialect (JSONB, relational constraints), or when you need **change events across windows** (`LISTEN`/`NOTIFY`, see [Multi-window and transactions](#multi-window-and-transactions)) — at the cost of tens of megabytes of WASM and one worker thread.

Queries, transactions, and branch switching reuse `@aiao/rxdb-adapter-sqlite-core` / `@aiao/rxdb-adapter-pglite`, with the same semantics and the same test suites as their respective browser tiers.

## Installation

```bash npm2yarn
npm install @aiao/rxdb-adapter-electron
```

For SQLite alone, this is all you need. **Only for PGlite** do you need two more optional peers:

```bash npm2yarn
npm install @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

Both are declared as `optional: true` peers precisely so SQLite-only apps never have to install PGlite — which is also why the four entry points below must stay separate.

## Four entry points

The package is **deliberately** split into four entry points; do not mix them. The split follows two orthogonal lines: **renderer / privileged side** (who may touch the file system) × **SQLite / PGlite** (which optional peer gets imported).

| entry                                     | loaded by                                | heavy dependency imported                     |
| ----------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `@aiao/rxdb-adapter-electron`             | renderer (browser context)               | none, safe to bundle                          |
| `@aiao/rxdb-adapter-electron/host`        | Electron main process / a worker it owns | `node:sqlite`                                 |
| `@aiao/rxdb-adapter-electron/pglite`      | renderer (browser context)               | only `@aiao/rxdb-adapter-pglite` + types      |
| `@aiao/rxdb-adapter-electron/pglite-host` | Electron main process / a worker it owns | `@electric-sql/pglite` (full PostgreSQL WASM) |

:::warning Host entries must never enter a renderer bundle

Bundling either host entry into a renderer bundle hands file system capability back to the renderer, voiding the whole isolation. `node:sqlite` is only reachable behind the `/host` subpath entry; the renderer entry (`.`) references no Node built-in, so `node:sqlite` appearing in the output is a silent security regression rather than a build error — which is why the release process asserts the dependency graph of the real tarball artifacts.

:::

:::tip `/pglite` does not add tens of megabytes to a renderer bundle

The `/pglite` renderer entry **does not reference the PostgreSQL runtime**: the WASM instance lives on the privileged side, and the renderer only has a protocol proxy — from `@electric-sql/pglite` it imports only types and the ~2 KB `/template` compiled subpath.

:::

## Wiring

Wiring has three parts: the main process starts the host, the preload exposes the transport, and the renderer uses it like any other adapter.

### 1. Main process: start the host

```typescript
import { createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { app, ipcMain, type WebContents } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(app.getPath('userData'), 'rxdb-data');

// sessionId → the window that owns the session. Open responses carry the sessionId; change events are routed by it.
const targets = new Map<string, WebContents>();

const host = createElectronSqliteHost({
  // Only the host app knows its data directory. The incoming name has passed whitelist validation and contains no path separators.
  resolveDatabasePath: databaseName => {
    mkdirSync(root, { recursive: true });
    return join(root, databaseName);
  },
  postChange: message => {
    const target = targets.get(message.sessionId);
    // Window is gone: the write is already persisted, the event has nowhere to go. A routine race, not a failure.
    if (!target || target.isDestroyed()) return;
    target.send('desktop-sqlite:change', message);
  },
  onDeliveryError: error => console.warn('[desktop-sqlite] change event delivery failed', error)
});

// host.handle never rejects: failures come back as responses with `kind: 'error'`.
// ipcRenderer.invoke flattens errors into strings on rejection, losing custom error codes.
ipcMain.handle('desktop-sqlite:request', async (event, payload: unknown) => {
  const response = await host.handle(payload);
  if (response.kind === 'open') targets.set(response.result.sessionId, event.sender);
  return response;
});

app.on('before-quit', () => host.closeAll());
```

### 2. Preload: expose the transport

The transport has only two methods, so the renderer never gets the raw `ipcRenderer` and cannot message arbitrary channels.

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Must match the adapter's DESKTOP_HOST_TRANSPORT_KEY verbatim.
contextBridge.exposeInMainWorld('__aiaoRxdbDesktopHost__', {
  request: (payload: unknown) => ipcRenderer.invoke('desktop-sqlite:request', payload),
  subscribe: (listener: (message: unknown) => void) => {
    // Forward the message body only: IpcRendererEvent carries the sender, and handing it to the renderer would hand over channel capabilities too.
    const forward = (_event: IpcRendererEvent, message: unknown): void => listener(message);
    ipcRenderer.on('desktop-sqlite:change', forward);
    return () => ipcRenderer.removeListener('desktop-sqlite:change', forward);
  }
});
```

### 3. Renderer: use it like any other adapter

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: ELECTRON_ADAPTER_NAME } }
});

// No transport passed: the adapter looks up the preload-exposed bridge on the global key itself.
rxdb.adapter(ELECTRON_ADAPTER_NAME, async database => new RxDBAdapterElectron(database));
rxdb.init();
await rxdb.connect(ELECTRON_ADAPTER_NAME);

// Return the connection to the host when the component/window is destroyed, otherwise the session is only reclaimed on window 'destroyed'.
await rxdb.disconnectAll();
```

### Switching to PGlite

On the renderer side only two names change; everything else is verbatim — the transport, preload, and error contract are shared by both families:

```typescript
import { ELECTRON_PGLITE_ADAPTER_NAME, RxDBAdapterElectronPGlite } from '@aiao/rxdb-adapter-electron/pglite';

rxdb.adapter(
  ELECTRON_PGLITE_ADAPTER_NAME,
  async database => new RxDBAdapterElectronPGlite(database, { dataDirectoryName: 'demo-pgdata' })
);
```

On the privileged side, switch to `createElectronPgliteHost` (from `/pglite-host`) and put it in a worker as described below under "Do not put the PGlite host on the main thread".

> No new IPC channel is needed for PGlite: one `request` / `subscribe` pair suffices, and the main process dispatches by the request's `kind` to the SQLite / file / PGlite host families. Use the protocol packages' exported `isDesktopPgliteRequestKind` (`/pglite-host`) and `isDesktopHostFileRequestKind` (`/host`) as the dispatch criteria — do not hand-list `kind` names at the wiring site; the `kind` closed-set guard is your app's own few lines — the SQLite branch is the fallback, and missing a family does not error but silently runs a PGlite request through the SQL path. See [dev-rxdb-electron](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron)'s `desktop-host-bridge.ts` and `desktop-host-request-guard.ts` for the complete implementation.

## The PGlite half: data directory and the IPC transaction protocol

`pglite-electron` persists a **PGlite data directory** (an initdb-generated directory tree, not a single file). Its protocol shape is frozen by US-208 as the "IPC transaction id protocol":

- **The main process holds the connection**: a data directory does not support two instances opening it concurrently, so the host reuses a single instance per data directory name — a second window opening the same directory gets the same instance, not a second one.
- **The renderer strings multiple round trips together with transaction ids**: PGlite only offers callback-shaped transactions (`transaction(cb)` — returning commits, throwing rolls back), and a callback cannot cross IPC. The protocol is therefore explicit `begin` / `query` / `commit` / `rollback` — the same transaction id binds to the same physical connection, and every statement really runs in the same transaction; none is split into an implicit transaction.
- **Transaction ids are random and session-bound**: mismatched ownership reports `transaction_not_found`; `begin` fails fast with `transaction_unavailable` when no connection can be obtained (the timeout budget comes from `DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS`), never waiting forever. When a window crashes or closes, all in-flight transactions under that session are rolled back and released (`releaseOwner` is hooked to `render-process-gone` and the window `destroyed`), leaving no dangling transactions.
- **A single instance brings cross-window notification**: `LISTEN` subscribes once at instance creation, and on `NOTIFY` fans out to all sessions under that instance name, so a write in window A triggers reactive queries in window B (the SQLite side cannot do this, see the next section).

:::warning Do not put the PGlite host on the main thread

PGlite's WASM runs an entire query **synchronously on the calling thread**: a measured 2-second query blocked the main process for 2007 ms — no window repaint, no menu response, all IPC queued. "The main process holds the single instance" and "the main process must not block" therefore cannot both hold, so the single instance has to move to its own worker thread. And it must be the **entire host** that moves, not just PGlite: `ElectronPgliteRuntime.transaction` takes a callback, and a callback cannot cross a thread boundary. Once the host moves, only pure data such as `DesktopPgliteRequest` / `DesktopPgliteResponse` flows across the thread boundary.

:::

## Multi-window and transactions

**The two families behave differently in this section** — the easiest difference to trip on when choosing:

| dimension             | `sqlite-electron`                                    | `pglite-electron`                                                                       |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| connection model      | one independent connection per `open`                | one **shared instance** per data directory, reused across sessions                      |
| concurrent writes     | SQLite file lock + backoff retries → `database_busy` | transactions queue on the single connection → timeout reports `transaction_unavailable` |
| change across windows | ❌ does not cross                                    | ✅ crosses, `NOTIFY` fans out to all sessions of the instance                           |

SQLite-side transactions use `BEGIN IMMEDIATE` rather than bare `BEGIN`: the write lock is taken at transaction start, and on collision the transaction has not started yet, so it retries with exponential backoff (default total budget 5 seconds, adjustable via the host's `busyRetryBudgetMs`), reporting `database_busy` on timeout. The cost is that **change events do not cross windows** — every `open` gets an independent connection, and notifications rely on per-connection TEMP triggers, so a write in window A does not trigger reactive queries in window B. The data itself stays consistent (same file, guaranteed by SQLite's locking); what is inconsistent is only "when B learns about it". When cross-window realtime updates are needed, the host app broadcasts itself (e.g. the main process forwards the events `postChange` receives to the remaining `webContents`, and each renderer re-queries after receiving them).

## Capability matrix

| storage               | status                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| SQLite single file    | ✅ host ships in the package (`/host`), adapter name `sqlite-electron`                                  |
| PGlite data directory | ✅ host ships in the package (`/pglite-host`), adapter name `pglite-electron`; needs the optional peers |

Combinations outside the matrix are rejected by `assertDesktopSqliteStorage` with `unsupported_runtime_engine` — no silent degradation. The host side needs a Node runtime (built-in `node:sqlite` on the SQLite side; the ability to load `@electric-sql/pglite` on the PGlite side); the package is verified on Node 26 and Electron 43, earlier versions are unverified.

**Full-text search is still unavailable for both families**: `@aiao/rxdb-plugin-search`'s allowlist only contains in-browser engines (`sqlite-wasm` / `sqlite` / `sqliteai` / `pglite`); neither desktop adapter name is in the list, so `createRxDatabase` throws `SearchUnsupportedAdapterError` — no degradation, no `.search`.

## The `./desktop` entry of rxdb-plugin-storage

Desktop file storage and the desktop database belong to one backup domain and use **the same host channel**: the file host is `createElectronFileHost`, exported from the `/host` entry, with no new preload method. Usage is documented in [rxdb-plugin-storage docs](/plugins/rxdb-plugin-storage/README.md):

```typescript
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';

rxdb.use(rxDBPluginStorage, {
  rootDir: 'files',
  filesystem: createDesktopStorageFilesystem()
});
```

Key points: file content lands under the app data directory (`userData/rxdb-files` in the example app), not through OPFS; before enabling, it validates that `sync.local.adapter` is a desktop SQLite adapter, throwing `adapter_mismatch` on mismatch — no degradation, no silent acceptance — otherwise metadata and files would fall back into two backup domains.

## When to use

- Electron apps that need local data "the user can see, back up, and that only disappears on uninstall";
- data volumes beyond the comfort zone of browser storage quotas, or when the risk of OPFS being reclaimed by the browser is unacceptable;
- external tools opening the same data directly (SQLite: `sqlite3` CLI, DB Browser).

In the **browser** (including Electron renderer scenarios where you do not want to run a host), use the [wa-sqlite adapter](/adapters/sqlite.md) (or [sqlite-wasm](/adapters/sqlite-wasm.md)). One sentence to tell them apart: browser adapters live within browser storage quotas and reclamation policies, while desktop adapters put data back into a directory the app controls. For the full comparison see the [adapter overview](/adapters/README.md).

## Reference

- [Package README](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-electron)
- [dev-rxdb-electron complete example](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron): `src-electron/desktop-sqlite-bridge.ts` (SQLite main-process wiring), `src-electron/desktop-pglite-bridge.ts` + `src-electron/desktop-pglite-worker.ts` (PGlite host and worker), `src-electron/preload.ts` (bridge exposure), `src/app/services/local-database.service.ts` (renderer-side usage)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

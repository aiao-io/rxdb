# rxdb-adapter-tauri

RxDB adapter that stores data in a **real SQLite file inside the Tauri app's private directory**.

Data is read and written directly by the Rust side using `rusqlite`; the WebView only sends protocol requests via `invoke` / `listen`, so it gets neither a filesystem handle nor a physical path.

For Electron use [`@aiao/rxdb-adapter-electron`](https://www.npmjs.com/package/@aiao/rxdb-adapter-electron) instead: the protocol and the renderer client are shared by both packages (in `@aiao/rxdb-adapter-sqlite-core/desktop-host`); the only difference is whether the privileged side is Rust or `node:sqlite`.

## Features

- **Real file persistence**: data lives in a `.sqlite3` file in the app data directory, survives restarts, and does not depend on WebView storage quotas
- **Zero filesystem permissions in the WebView**: no `fs` permission to enable, and no path handed to the frontend
- **No fallback**: when a storage configuration is unsupported it throws immediately; it never silently switches to memory/OPFS/IndexedDB
- **Reuses the SQL core**: queries, transactions, and branch switching all come from `@aiao/rxdb-adapter-sqlite-core`, with the same semantics as wa-sqlite / sqlite-wasm

## ⚠️ Rust host: same project, but not distributed via npm

This npm package is **only the WebView side**: `createTauriHostTransport` is a pipe that connects `invoke` / `listen` to the protocol. The `rusqlite` host on the other end of the pipe (the `rxdb_desktop_request` command, the engine, the session table) is a Rust crate that ships with the application binary and cannot be installed from npm.

It lives in [`rust/`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-tauri/rust) under this package's directory (crate name `aiao-rxdb-tauri`) — both ends of the wire protocol live in the same project, so changing one side means seeing the other.

**The crate is not yet published to crates.io**, so today it can only be referenced as a git dependency:

```toml
# src-tauri/Cargo.toml
[dependencies]
aiao-rxdb-tauri = `{ git = "https://github.com/aiao-io/rxdb", tag = "v0.0.28" }`
```

For limitations and roadmap see [`rust/README.md`](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-tauri/rust/README.md).

## Capability matrix

| Storage               | Status                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| SQLite single file    | ✅ Adapter name `sqlite-tauri`, provided by the Rust host                                 |
| PGlite data directory | ❌ Never supported: PGlite's synchronous filesystem contract requires a Node main process |

Combinations outside the matrix are rejected by `assertDesktopSqliteStorage` with `unsupported_runtime_engine` — no silent degradation.

## Installation

```bash
npm install @aiao/rxdb-adapter-tauri
# or
pnpm add @aiao/rxdb-adapter-tauri
```

## Usage

### 1. Rust side: register the command, host the engine, wire up both reclamation points

`aiao-rxdb-tauri` is a **plain crate, not a Tauri plugin**, so the app registers the command itself via `generate_handler!`:

```rust
use aiao_rxdb_tauri::commands::{rxdb_desktop_request, DesktopHost};
use tauri::Manager;

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![rxdb_desktop_request])
    .setup(|app| {
        let dir = app.path().app_data_dir()?;
        // The third argument is the **window allowlist**: only windows with these labels can call `rxdb_desktop_request`.
        app.manage(DesktopHost::new(app.handle(), dir, &["main"]));
        Ok(())
    })
    // Reclaim a window's sessions when the window is gone, without waiting for the whole app
    // to exit: hook `Destroyed` instead of `CloseRequested` — the latter can be prevented and
    // never fires when a window crashes. A window that vanishes while holding an exclusive file
    // lock would leave another window's `lockAcquire` waiting indefinitely.
    .on_window_event(|window, event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            window.state::<DesktopHost>().close_window(window.label());
        }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    // Explicitly close all sessions before exit; otherwise the `-wal` / `-shm` files and file
    // handles live until the process is killed, and the database file stays occupied after the
    // application closes.
    .run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<DesktopHost>().close_all();
        }
    });
```

The allowlist has no default and cannot be omitted. App-defined commands are open to **every** webview (the next paragraph explains why), and session ownership only stops "using someone else's sessionId", not "opening a new session of your own" — without naming an owner, any window (a debug window, some window you forget to exclude later) can open an app-scoped database on its own. Requests from windows not on the allowlist get a plain response `{ kind: "error", code: "permission_denied" }`.

Being a plain crate rather than a plugin is deliberate: app-defined commands registered via `generate_handler!` are **not subject to capability gating** (only commands with the `core:` / `plugin:` prefix are), so connecting the desktop database does **not** require granting the app any of the `sql` / `fs` / `shell` plugin permissions. As a plugin the command would carry the `plugin:` prefix and fall exactly under the gate — the savings would only be the boilerplate above, while losing a structural security property.

Only the `rxdb_desktop_request` command is ungated. **The change-event half still goes through the gate**: `listen` is `core:event:listen`, and a window using it needs `core:event:default` (already included in `core:default`, so the scaffolding's `default.json` works out of the box). What actually bites is a window whose permissions were hand-trimmed — the symptom is ugly then: `invoke` works, the database opens, queries return data, but change events never arrive and the UI stays frozen on the first query result, with no error at all. Add `core:event:default` to that window's capability.

The command name and the event name are pinned by two constants in this package (`TAURI_DESKTOP_REQUEST_COMMAND` / `TAURI_DESKTOP_CHANGE_EVENT`); renaming one side breaks the pairing. Change events are delivered per `sessionId`, with the event name `rxdb-desktop-change`.

### 2. WebView side: use it like any other adapter

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { createTauriHostTransport, RxDBAdapterTauri, TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const transport = createTauriHostTransport({ invoke, listen, target: getCurrentWebviewWindow().label });

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: `{ type: SyncType.None, local: { adapter: TAURI_ADAPTER_NAME } }`
});

rxdb.adapter(TAURI_ADAPTER_NAME, async database => new RxDBAdapterTauri(database, { transport }));
rxdb.init();
await rxdb.connect(TAURI_ADAPTER_NAME);

// Return the connection to the host when the component/window is destroyed;
// otherwise the session is only reclaimed when the process exits.
await rxdb.disconnectAll();
```

`invoke` / `listen` are injected by the caller instead of the package importing `@tauri-apps/api` directly: doing so would pin a runtime dependency that only exists inside Tauri into the package's dependency graph, and the package could never load again in browser test environments.

`target` is **required**; it is the other half of targeted delivery. The host uses `emit_to(owner)` to send change events only to the window that opened the session, but tauri matches unconditionally when a listener's target is `Any` — and `listen()` defaults to exactly `Any`. Registering on the receiving side without a target means any webview that can call `listen` receives every window's sessionIds, database names, and table names. Injecting `getCurrentWebviewWindow().listen` also works: that `listen` carries the window target itself and ignores this field.

## A logical database name is not a path

`databaseName` is a **logical name within the app scope**. The WebView has no way to know, and no need to know, the physical root directory.

When omitted it is derived as `${rxdb.config.dbName}.sqlite3`; you only need to specify it explicitly when taking over an existing database, or when multiple RxDB instances share the same file.

The allowed set is an allowlist `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/` (≤ 128 characters), not a denylist: the character set contains no `/`, `\`, or `:`, and does not allow a leading `.`, so `..`, absolute paths, drive letters, `~` expansion, and URL schemes all fall outside the set without having to enumerate attack shapes one by one. Violations throw `invalid_database_name`.

> The name comes from the WebView and is **untrusted**. The Rust host validates it again (`paths.rs`); an illegal input should leave no trace on disk.

## Value encoding

SQLite values round-trip through JSON; `encodeDesktopJsonPayload` / `decodeDesktopJsonPayload` handle the two things JSON alone cannot do:

- **`Uint8Array` ↔ base64**: JSON has no binary type; `JSON.stringify` on a BLOB would produce an object expanded by index like `{"0":1,"1":2}`;
- **Large integers**: `INTEGER` values beyond `Number.MAX_SAFE_INTEGER` are carried as strings to avoid silently losing precision.

Encoding on both ends is verified by the conformance suite in this package's `conformance/` directory over real process round-trips; `rust/src/value.rs` is its Rust counterpart.

### Non-finite numbers: one known difference from Electron

JSON cannot express `Infinity` / `-Infinity` / `NaN`; `JSON.stringify` turns them into `null`. Following suit silently would make an `INSERT` bound with `Infinity` land a NULL in the database — what got written is not the value you gave, and no error is reported anywhere along the way. This adapter therefore rejects these three values **in both directions** with `protocol_violation`:

- **Writes**: if a binding parameter contains a non-finite number, the request is rejected on the WebView side and never sent to the host (`encodeDesktopJsonPayload`);
- **Reads**: if a column value is a non-finite REAL (e.g. `SELECT 1e400` overflows to `Infinity`), the host refuses to encode the response (`encode_real` in `rust/src/value.rs`).

Electron's IPC is structured clone, which can carry non-finite numbers, so the same two things there are a successful write and a read back of `Infinity`. This is one known value-level difference between the two ends: **portable code across backends should not store non-finite numbers in SQLite** (store `NULL` or a sentinel value, or use a string instead).

## Error codes

Program logic should read `error.code`, not match message text (messages are prefixed with `[code]` plus a space, only for easy log searching). Error codes are **fully shared with the Electron side**, defined in `RxDBAdapterDesktopErrorCode` in `@aiao/rxdb-adapter-sqlite-core/desktop-host`:

| code                         | Meaning                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `unsupported_runtime_engine` | The storage `engine` is outside the capability matrix (e.g. PGlite data directory)                               |
| `invalid_database_name`      | The logical database name is invalid, or attempts to escape the app scope                                        |
| `host_unavailable`           | The request never reached the host (command not registered / capability denied / parameter serialization failed) |
| `session_closed`             | The session was used after being disconnected                                                                    |
| `protocol_violation`         | The request or response does not match the protocol shape                                                        |
| `open_failed`                | Opening the database failed; `cause` preserves the original reason                                               |
| `permission_denied`          | The path lacks permission, or the statement was rejected by the authorizer                                       |
| `database_corrupted`         | The target file is not a usable SQLite database                                                                  |
| `statement_failed`           | The SQL itself failed to execute (syntax, constraints, etc.)                                                     |
| `host_internal_error`        | The host itself errored; a defect rather than a caller problem                                                   |
| `database_busy`              | Another connection holds a conflicting lock; retrying works, no data loss                                        |
| `file_not_found`             | The target file or directory does not exist                                                                      |
| `invalid_file_path`          | The path escapes the storage root, or points at a type that does not match the operation                         |
| `disk_full`                  | Disk space or quota exhausted                                                                                    |
| `write_aborted`              | The write token is no longer valid; the target keeps its pre-write contents                                      |
| `transaction_not_found`      | The transaction ID does not exist, has ended, or does not belong to this session; no statement was executed      |
| `transaction_unavailable`    | Timed out waiting to open a transaction; another transaction occupies the connection; no data loss, retry works  |

The last six only occur on the file-storage path (the desktop backend of `@aiao/rxdb-plugin-storage`) and the transaction path.

`RxDBAdapterDesktopErrorCode` has five more codes — `restore_in_progress` / `restore_incomplete` / `target_not_empty` / `cleanup_pending` / `unsupported_operation` — that belong only to Electron's PGlite host (US-217); the Rust host never emits them. Backup and restore failures on the Tauri side are always `RxDBBackupError`; see "Backup and restore".

Error codes are **part of the contract**: new codes may only be appended, never reused or redefined.

The `RxDBAdapterDesktopError` class cannot survive `invoke` serialization; host-side errors come back to the WebView as `{ kind: 'error', code, message }`, and the adapter rethrows them as `RxDBAdapterDesktopError` per the contract — callers still write ordinary `try/catch`. A `code` outside the contract is always treated as `protocol_violation`, never passed through verbatim as an error code.

## Protocol version

The wire protocol version is stored on both the TS and the Rust side (`DESKTOP_HOST_PROTOCOL_VERSION` and `PROTOCOL_VERSION` in `rust/src/protocol.rs`). The only mechanical link between the two constants is the conformance suite's `conformance/protocol-handshake.spec.ts`: it compares the number reported by a real process against the constant, and that test goes red when one side is changed without the other.

The renderer sends a side-effect-free `handshake` before `open` to negotiate the version; if the handshake fails, no database is created — a version mismatch should not leave an extra empty file on disk.

The current version is 2: US-217 added the `mute` request for restore and raised the per-statement length limit to 64 Mi. A v1 host rejects both only in the middle of a restore, by which point the target database has already been written, so the version had to be bumped to let restore detect an old host before writing to the target. `aiao-rxdb-tauri` and this package must take the same version.

## Backup and restore

`sqlite-tauri` can write an entire database as a `.rxdb-backup` archive stream and restore it into an **empty, unconnected** target. The implementation is shared with the browser-side SQLite adapters and Electron's `sqlite-electron`; for archive format, compatibility checks, and interruption/cleanup semantics see ["Backup and restore" in `@aiao/rxdb-adapter-sqlite-core`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-sqlite-core#备份与恢复). Both ends stream chunk by chunk, and failures always throw a distinguishable `RxDBBackupError` (branch on `error.code`), never report success.

> **External files are outside the backup scope.** The archive contains only the database itself; the result and the manifest's `scope` are always `{ database: 'included', externalFiles: 'excluded' }`. Files placed by the `@aiao/rxdb-plugin-storage` desktop backend in the file host root must be backed up and restored separately.

Input and output streams are provided by the caller (`ReadableStream<Uint8Array>` / `WritableStream<Uint8Array>`): this package opens no file pickers and grants the WebView no arbitrary paths; where to write and where to read from is up to the host application.

```typescript
// Backup: the sink is provided by the host application
const adapter = await rxdb.getAdapter(TAURI_ADAPTER_NAME);
const result = await adapter.backup(sink);

// Restore: the target has a registered adapter but has not connected yet
const restored = await target.getAdapter(TAURI_ADAPTER_NAME);
await restored.restore(source);
await target.connect(TAURI_ADAPTER_NAME);
```

Three extra points compared to the browser side:

- **WAL**: the Rust host opens database files in WAL mode. Backup is a logical dump inside a read transaction, so data committed before the snapshot boundary but not yet checkpointed into the main file is included in the archive — no "copy only the main file and miss the WAL".
- **Exclusive**: the same database file may be open in other windows or other processes, and Web Locks cannot stop them. Before restore and cleanup even check whether the target is empty, their own connection takes SQLite's file-level exclusive lock and holds it until restore completes or failed-restore cleanup finishes; if the database file is open on any other connection at that moment it reports `target_busy` (`details.field` is `storage`). Other processes cannot open it during restore either: connections Web Locks cannot see report `database_busy` after exhausting the host's 5-second busy timeout.
- **FTS5 available**: the Rust host does not run in defensive mode, so databases containing FTS5 virtual tables can be backed up and remain word-searchable after restore. This is one difference from `sqlite-electron`: the host there runs defensive, and the same database reports `unsupported_combination`.

An archive restores only into the **same adapter**: a `sqlite-tauri` archive cannot restore into `sqlite-electron` or browser-side SQLite, and vice versa; both report `incompatible_archive`.

## Full example

See [dev-rxdb-tauri](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-tauri): `src-tauri/src/lib.rs` (Rust-side wiring, the snippet above) and `src/app/setup_rxdb_desktop.ts` (WebView-side wiring). The host implementation and the cross-process conformance suite live in this package's `rust/` and `conformance/`.

Entry point of `@aiao/rxdb-adapter-tauri`.

## Remarks

This package is **one side only**: the WebView. Electron splits into a `.` and a `./host` entry because the privileged-side `node:sqlite` host is also written in TypeScript and must be kept behind a separate entry so it never lands in the renderer bundle. Tauri's privileged side is Rust — it ships with the application binary, is not distributed via npm, and so has no second entry to split off. Correspondingly, no `node:` builtin should ever appear in this package (`tsconfig.lib.json`'s `types: []` enforces that).

The protocol, the renderer client, the storage union, and the error types are **implemented** in
`@aiao/rxdb-adapter-sqlite-core/desktop-host` (US-207 E1), shared by both desktop runtimes,
and bound to the Rust side's `protocol.rs` by `conformance/protocol-handshake.spec.ts`.
This entry re-exports them as-is: downstream imports by name, and moving an implementation between packages should not force users to change a line.

## Classes

| Class                                                         | Description                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [DesktopSqliteClient](classes/DesktopSqliteClient.md)         | Client for accessing a local SQLite file through the desktop host.        |
| [RxDBAdapterDesktopError](classes/RxDBAdapterDesktopError.md) | Desktop adapter error.                                                    |
| [RxDBAdapterTauri](classes/RxDBAdapterTauri.md)               | Connects RxDB to a real SQLite file in the Tauri app's private directory. |

## Interfaces

| Interface                                                                    | Description                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [DesktopHostChangeEventMessage](interfaces/DesktopHostChangeEventMessage.md) | Change event the host pushes to the renderer proactively.                                               |
| [DesktopHostCloseRequest](interfaces/DesktopHostCloseRequest.md)             | Closes a session and releases the database handle.                                                      |
| [DesktopHostExecuteRequest](interfaces/DesktopHostExecuteRequest.md)         | Executes SQL on an open session.                                                                        |
| [DesktopHostFileEntry](interfaces/DesktopHostFileEntry.md)                   | Directory entry: only the name and type, no physical path leaked.                                       |
| [DesktopHostFileReadResult](interfaces/DesktopHostFileReadResult.md)         | One frame of a `file.read` result.                                                                      |
| [DesktopHostFileStat](interfaces/DesktopHostFileStat.md)                     | Metadata of a single path; expressed as `null` when the target does not exist, not as an error.         |
| [DesktopHostHandshakeRequest](interfaces/DesktopHostHandshakeRequest.md)     | Negotiates the wire protocol version.                                                                   |
| [DesktopHostHandshakeResult](interfaces/DesktopHostHandshakeResult.md)       | Response to the `handshake` request.                                                                    |
| [DesktopHostMuteRequest](interfaces/DesktopHostMuteRequest.md)               | Pauses / resumes change-event collection for a session (protocol v2).                                   |
| [DesktopHostOpenRequest](interfaces/DesktopHostOpenRequest.md)               | Opens a database session.                                                                               |
| [DesktopHostOpenResult](interfaces/DesktopHostOpenResult.md)                 | Response to the `open` request.                                                                         |
| [DesktopHostTransport](interfaces/DesktopHostTransport.md)                   | Transport layer between the renderer and the host.                                                      |
| [DesktopHostVersionRequest](interfaces/DesktopHostVersionRequest.md)         | Queries the engine version of the database a session is connected to.                                   |
| [DesktopOptions](interfaces/DesktopOptions.md)                               | Desktop adapter options.                                                                                |
| [DesktopPgliteDirectoryStorage](interfaces/DesktopPgliteDirectoryStorage.md) | PGlite data directory desktop storage.                                                                  |
| [DesktopSqliteClientOptions](interfaces/DesktopSqliteClientOptions.md)       | Optional behavior parameters for [DesktopSqliteClient.connect](classes/DesktopSqliteClient.md#connect). |
| [DesktopSqliteFileStorage](interfaces/DesktopSqliteFileStorage.md)           | SQLite single-file desktop storage.                                                                     |
| [TauriHostTransportOptions](interfaces/TauriHostTransportOptions.md)         | Dependency injection point of [createTauriHostTransport](functions/createTauriHostTransport.md).        |
| [TauriOptions](interfaces/TauriOptions.md)                                   | Tauri adapter options.                                                                                  |

## Type Aliases

| Type Alias                                                                 | Description                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [DesktopHostFileLockMode](type-aliases/DesktopHostFileLockMode.md)         | Lock mode, consistent with the same-named values of Web Locks.                             |
| [DesktopHostFileRequest](type-aliases/DesktopHostFileRequest.md)           | All requests the renderer can send to the file host.                                       |
| [DesktopHostFileResponse](type-aliases/DesktopHostFileResponse.md)         | The host's response to one file request; failures also go through the normal return value. |
| [DesktopHostRequest](type-aliases/DesktopHostRequest.md)                   | All requests the renderer can send to the host.                                            |
| [DesktopHostResponse](type-aliases/DesktopHostResponse.md)                 | The host's response to one request.                                                        |
| [DesktopStorage](type-aliases/DesktopStorage.md)                           | Discriminated union of desktop storage configurations, distinguished by `engine`.          |
| [RxDBAdapterDesktopErrorCode](type-aliases/RxDBAdapterDesktopErrorCode.md) | Stable error codes the desktop adapter promises to the outside.                            |

## Variables

| Variable                                                                                 | Description                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [DESKTOP\_DEFAULT\_DATABASE\_SUFFIX](variables/DESKTOP_DEFAULT_DATABASE_SUFFIX.md)       | Suffix appended when deriving the logical file name from the RxDB database name.          |
| [DESKTOP\_HOST\_MAX\_BINDINGS](variables/DESKTOP_HOST_MAX_BINDINGS.md)                   | Maximum number of binding parameters allowed per request.                                 |
| [DESKTOP\_HOST\_MAX\_BLOB\_BYTES](variables/DESKTOP_HOST_MAX_BLOB_BYTES.md)              | Byte limit for a single blob binding parameter.                                           |
| [DESKTOP\_HOST\_MAX\_FILE\_CHUNK\_BYTES](variables/DESKTOP_HOST_MAX_FILE_CHUNK_BYTES.md) | Byte limit for one frame of file read/write.                                              |
| [DESKTOP\_HOST\_MAX\_SQL\_LENGTH](variables/DESKTOP_HOST_MAX_SQL_LENGTH.md)              | Maximum length of a single SQL statement on the SQLite wire protocol (UTF-16 code units). |
| [DESKTOP\_HOST\_PROTOCOL\_VERSION](variables/DESKTOP_HOST_PROTOCOL_VERSION.md)           | Wire protocol version.                                                                    |
| [DESKTOP\_HOST\_TRANSPORT\_KEY](variables/DESKTOP_HOST_TRANSPORT_KEY.md)                 | Key the preload uses when mounting the transport layer on the renderer global.            |
| [TAURI\_ADAPTER\_NAME](variables/TAURI_ADAPTER_NAME.md)                                  | Name of the adapter in the `RxDBAdapters` registry.                                       |
| [TAURI\_DESKTOP\_CHANGE\_EVENT](variables/TAURI_DESKTOP_CHANGE_EVENT.md)                 | Tauri event name the host uses to push change events.                                     |
| [TAURI\_DESKTOP\_REQUEST\_COMMAND](variables/TAURI_DESKTOP_REQUEST_COMMAND.md)           | Name of the Rust-side `#[tauri::command]`.                                                |

## Functions

| Function                                                                        | Description                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [assertDesktopHostResponse](functions/assertDesktopHostResponse.md)             | Validates a host response and turns error responses back into local exceptions.                                |
| [assertDesktopSqliteStorage](functions/assertDesktopSqliteStorage.md)           | Validates that the storage configuration really is the only engine this protocol carries — SQLite single file. |
| [assertValidDesktopDatabaseName](functions/assertValidDesktopDatabaseName.md)   | Validates a logical database name.                                                                             |
| [createTauriHostTransport](functions/createTauriHostTransport.md)               | Assembles a desktop host transport from Tauri's `invoke` / `listen`.                                           |
| [decodeDesktopJsonPayload](functions/decodeDesktopJsonPayload.md)               | Restores a JSON payload to the runtime types used by the protocol.                                             |
| [encodeDesktopJsonPayload](functions/encodeDesktopJsonPayload.md)               | Encodes a protocol payload into a plain JSON-serializable shape.                                               |
| [isDesktopPgliteDirectoryStorage](functions/isDesktopPgliteDirectoryStorage.md) | Checks whether a storage configuration has the PGlite data directory shape.                                    |
| [isDesktopSqliteFileStorage](functions/isDesktopSqliteFileStorage.md)           | Checks whether a storage configuration has the SQLite single-file shape.                                       |
| [parseDesktopHostChangeEvent](functions/parseDesktopHostChangeEvent.md)         | Validates a change event pushed by the host.                                                                   |
| [parseDesktopHostHandshakeResult](functions/parseDesktopHostHandshakeResult.md) | Validates the `handshake` response.                                                                            |
| [parseDesktopHostOpenResult](functions/parseDesktopHostOpenResult.md)           | Validates the `open` response.                                                                                 |
| [resolveDesktopHostTransport](functions/resolveDesktopHostTransport.md)         | Re-exported only to keep the export surface symmetric with `@aiao/rxdb-adapter-electron`.                      |

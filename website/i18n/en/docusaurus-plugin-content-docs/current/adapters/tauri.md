# Tauri adapter

`@aiao/rxdb-adapter-tauri` lands data in **real SQLite files inside the Tauri app's private directory**: data is read and written directly by the Rust side using `rusqlite`, and the WebView only sends protocol requests through `invoke` / `listen` — so it gets neither file system handles nor physical paths, and the app does **not** need to be granted any `sql` / `fs` / `shell` plugin permissions.

## Positioning

From npm, this package is **only the WebView side**: `createTauriHostTransport` is a pipe connecting `invoke` / `listen` to the protocol, plus `RxDBAdapterTauri` the adapter itself (with JSON tag codec). The `rusqlite` host that actually opens the database on the other end of the pipe is a Rust crate shipped with the app binary — npm cannot install it.

The protocol, renderer client, storage union, and error types **share one implementation with the Electron side** (in `@aiao/rxdb-adapter-sqlite-core/desktop-host`); the only difference is whether the privileged side is Rust or `node:sqlite`. Queries, transactions, and branch switching all come from `@aiao/rxdb-adapter-sqlite-core`, with the same semantics as wa-sqlite / sqlite-wasm.

:::warning Rust host: the same project, but not distributed via npm

The host crate lives in [`rust/`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-tauri/rust) under this package's directory (crate name `aiao-rxdb-tauri`) — the two ends of the wire protocol live in the same project; changing one always sees the other.

**The crate is not yet published to crates.io**, so today it can only be referenced as a git dependency:

```toml
# src-tauri/Cargo.toml
[dependencies]
aiao-rxdb-tauri = { git = "https://github.com/aiao-io/rxdb", tag = "v0.0.28" }
```

See [`rust/README.md`](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-tauri/rust/README.md) for the limitations and plans.

:::

## Installation

```bash npm2yarn
npm install @aiao/rxdb-adapter-tauri
```

## Rust side: register the command, manage the host, hook the two cleanups

`aiao-rxdb-tauri` is an **ordinary crate, not a Tauri plugin**, so commands are registered by the app itself with `generate_handler!`:

```rust
use aiao_rxdb_tauri::commands::{rxdb_desktop_request, DesktopHost};
use tauri::Manager;

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![rxdb_desktop_request])
    .setup(|app| {
        let dir = app.path().app_data_dir()?;
        // The third argument is the window whitelist: only windows with these labels may call rxdb_desktop_request.
        app.manage(DesktopHost::new(app.handle(), dir, &["main"]));
        Ok(())
    })
    // Reclaim a window's session when the window is gone, not at app exit: hook Destroyed rather than CloseRequested —
    // the latter can be prevented and does not fire on window crashes. A window that vanished holding an exclusive
    // file lock would make another window's lockAcquire wait forever.
    .on_window_event(|window, event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            window.state::<DesktopHost>().close_window(window.label());
        }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    // Explicitly close all sessions before exit, otherwise the -wal / -shm files and file handles live until the
    // process is killed, and the database file stays occupied after the app closes.
    .run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<DesktopHost>().close_all();
        }
    });
```

Key points:

- **The whitelist has no default and cannot be omitted.** The app's own commands are open to every webview; session ownership only blocks "using someone else's sessionId", not "opening a new session of your own" — without naming an owner, any window (a debug window, a future window someone forgot to exclude) can open an app-scoped database on its own. Requests from windows outside the whitelist get an ordinary `{ kind: "error", code: "permission_denied" }` response.
- **Being an ordinary crate rather than a plugin is deliberate**: app-custom commands registered with `generate_handler!` are **not subject to capability gating** (only `core:` / `plugin:` prefixed commands are), so wiring up the desktop database **does not** require granting the app any plugin permission — `capabilities/default.json` needs zero changes. As a plugin, the command would carry the `plugin:` prefix and land exactly inside the gate.
- **The change-event half still goes through the gate**: `listen` is `core:event:listen`, so windows using it need `core:event:default` (`core:default` already includes it, which is why the scaffolded `default.json` works out of the box). What actually bites is a window with self-trimmed permissions — then `invoke` works, the database opens, and queries read data, but change events never arrive and the UI freezes at the first query's result, with no error at all.
- The command and event names are pinned by two constants of this package (`TAURI_DESKTOP_REQUEST_COMMAND` / `TAURI_DESKTOP_CHANGE_EVENT`); renaming either breaks the other side. Change events are routed by `sessionId`, with the event name `rxdb-desktop-change`.

## WebView side: use it like any other adapter

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
  sync: { type: SyncType.None, local: { adapter: TAURI_ADAPTER_NAME } }
});

rxdb.adapter(TAURI_ADAPTER_NAME, async database => new RxDBAdapterTauri(database, { transport }));
rxdb.init();
await rxdb.connect(TAURI_ADAPTER_NAME);

// Return the connection to the host when the component/window is destroyed, otherwise the session is only reclaimed at process exit.
await rxdb.disconnectAll();
```

Key points:

- `invoke` / `listen` are injected by the caller rather than imported from `@tauri-apps/api` by this package: doing that would pin a runtime dependency that only exists inside Tauri into the package's dependency graph, and this package could never load in a browser test environment again. Correspondingly, `RxDBAdapterTauri`'s `transport` is **required** — Tauri has no preload layer injecting a global bridge, so there is no "omit it and look it up on a global key" shape.
- `target` is **required**; it is the other half of directed delivery: the host uses `emit_to(owner)` to send change events only to the window that opened the session, but tauri matches unconditionally when the listener's target is `Any` — and `listen()`'s default is exactly `Any` — so a receiver registering without a target lets any webview that can call `listen` receive every window's sessionId, database name, and table name. Injecting `getCurrentWebviewWindow().listen` also works: that `listen` carries the window target itself and this field is ignored.

:::tip A logical database name is not a path

`databaseName` is a **logical name within the app scope**; the WebView has no way of knowing, and does not need to know, the physical root directory. When omitted it derives from `<dbName>.sqlite3`; the allowed set is the whitelist `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/` (≤ 128 characters), and violations throw `invalid_database_name`. The name comes from the WebView and is **untrusted**; the Rust host validates it once more.

:::

## Capability matrix

| storage               | status                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| SQLite single file    | ✅ adapter name `sqlite-tauri`, Rust host ships itself                                  |
| PGlite data directory | ❌ never supported: PGlite's synchronous file system contract needs a Node main process |

Combinations outside the matrix are rejected by `assertDesktopSqliteStorage` with `unsupported_runtime_engine` — no silent degradation. Full-text search is likewise unavailable: `sqlite-tauri` is not in `@aiao/rxdb-plugin-search`'s allowlist, and `createRxDatabase` throws `SearchUnsupportedAdapterError`. Error codes are **shared verbatim with the Electron side** (`RxDBAdapterDesktopErrorCode`, defined in `@aiao/rxdb-adapter-sqlite-core/desktop-host`); program branches should read `error.code`, never match message text.

## DevTools debug window

Tauri WebView does not support installing Chrome extensions, so `@aiao/rxdb-devtools` on Tauri takes the form of a **development-mode debug window** (US-905): under explicit development configuration it creates a `rxdb-devtools` window with a fixed label, speaking a versioned, bidirectional, strictly validated directed transport with the main WebView's connector. The debug window is **not a second RxDB writer** — it does not open SQLite directly; it only uses restricted debugging capabilities through the main WebView's connector, via the narrow seams of the US-210 host and the file host; release artifacts statically exclude the debug window bootstrap, its dedicated command, and the capability that serves only that label. In the DevTools forced VFS tiers, the idb tier and the opfs tier run in a dedicated Worker in the same shape (the production path still keeps the SharedWorker so multiple tabs share one connection). See [DevTools](../devtools/README.md) for how to wire it in.

## Choosing between Electron and Tauri

The two packages share one protocol and renderer client; only the privileged side differs:

| dimension              | Electron ([./electron.md](./electron.md))                                           | Tauri (this page)                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| privileged-side engine | `node:sqlite` / PGlite WASM (Node main process, ships in the package)               | `rusqlite` (Rust crate, git dependency, unpublished on crates.io)                |
| adapter name           | `sqlite-electron` / `pglite-electron`                                               | `sqlite-tauri`                                                                   |
| change across windows  | SQLite side does not cross; PGlite side crosses (`NOTIFY`)                          | does not cross (events only return to the window that opened the session)        |
| backup/restore FTS5    | host runs in defensive mode, databases with FTS5 virtual tables cannot be backed up | FTS5 available, databases with FTS5 virtual tables can be backed up and restored |

When you need the PostgreSQL dialect or cross-window change events, Electron + PGlite is the only path; for a single SQLite file, pick by your host stack.

## Reference

- [Package README](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-tauri)
- [rust/README.md](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-tauri/rust/README.md) (crate reference style and limitations)
- [dev-rxdb-tauri complete example](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-tauri): `src-tauri/src/lib.rs` (Rust-side wiring), `src/app/setup_rxdb_desktop.ts` (WebView-side wiring)

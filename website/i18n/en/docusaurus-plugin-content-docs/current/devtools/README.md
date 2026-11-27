# Devtools

`@aiao/rxdb-devtools` is the development-time connector between RxDB and the browser DevTools extension: it relays events, database summaries, entity query results, and branch operation results between the inspected page and the extension panel, letting developers watch entity data, the event stream, and storage state in real time.

> This package exposes database inspection, querying, and branch mutation capabilities. **Enable it only in development** — never initialize it in a production build.

## Install

```bash npm2yarn
npm install @aiao/rxdb-devtools
```

## Wiring it up

The public entry is `getDevToolsConnector()` — it returns the **page-level connector singleton** (`DevToolsConnector`). Call `init(rxdb, getEntityMetadata)` on it to register the RxDB instance to observe:

```typescript
import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

await rxdb.connect('wa-sqlite');

// Development only
if (import.meta.env.DEV && typeof window !== 'undefined') {
  getDevToolsConnector().init(rxdb, getEntityMetadata);
}
```

`init(rxdb, getEntityMetadata)` reads entity metadata, subscribes to RxDB events, and immediately sends one handshake; after the extension panel returns `HANDSHAKE_ACK`, the connector starts forwarding live events and flushes the events buffered in memory before the handshake. Notes:

- Repeated `init()` on the same RxDB object is idempotent; the current protocol supports **one** RxDB instance — passing a different instance throws.
- `getEntityMetadata` from `@aiao/rxdb` is the sole basis for masking encrypted fields — without it, the connector cannot tell which fields are ciphertext, and neither `QUERY_ENTITY` results nor event payloads get masked.
- `disconnect()` only breaks the connector's communication and cleans up listeners; it does not call `rxdb.disconnectAll()`. You can `init()` again afterwards.
- In environments without `window` (SSR), `init()` / `disconnect()` are no-ops.
- The caller is responsible for keeping `init()` out of production bundles. `getDevToolsConnector({ enabled: false })` works for tests or explicit opt-out, but is not a substitute for the build-time development gate; in production you can also lower `capabilities` to `'readonly'` or `'none'` to tighten the command tiers the panel can issue.

## Features

Once connected, the extension panel provides these panels:

- **Events**: live RxDB event stream and details
- **Database**: database info, entity list, and data queries
- **Branches**: view, create, switch, and delete branches
- **OPFS**: browse / upload / download / delete files and directories (OPFS in the browser, the native file backend on desktop)
- **Storage**: `StorageFileMeta` storage metadata
- **Settings**: theme, clear local data

## i18n inspection

When using [client-side i18n](/i18n/README.md), pass the same runtime to the connector explicitly:

```ts
getDevToolsConnector().init(rxdb, getEntityMetadata, { i18n: runtime });
```

The I18n panel shows the current language, available languages, the message catalog's source and override priority, and diagnostics for missing texts. Catalog, language, and diagnostic changes refresh the inspection content; the entry to clear missing-text diagnostics is only shown when the connection allows changes. Clearing acts only on the missing-text table; language preferences and app catalogs are preserved.

## Browser extension

After installing the browser extension, the DevTools panel appears in the browser developer tools (F12 → RxDB tab).

The extension source lives at [apps/rxdb-devtools-extension](https://github.com/aiao-io/rxdb/tree/main/apps/rxdb-devtools-extension) (Manifest V3). The panel itself is in the shared library `modules/rxdb-devtools-panel`; the Chrome / Electron / Tauri hosts share one UI and state machine, and `apps/rxdb-devtools-extension` only provides the Chrome-side host adaptation.

## Desktop debugging

### Tauri: debug window and directed transport (US-905)

Tauri WebViews cannot install Chrome extensions, so the Tauri side does not promise "installing the CRX into Tauri" — instead, a **debug window** model: under an explicit development configuration, `dev-rxdb-tauri` creates a label-pinned `rxdb-devtools` WebView window that loads the same panel as the Chrome extension; in release artifacts this window bootstrap, its dedicated commands, and the capability serving only that label do not exist (`#[cfg(dev)]` compile isolation).

Between the main WebView and the debug window runs a **versioned, bidirectional, strictly validated directed transport**: messages bind session, sender identity, main window label, debug window label, and provider owner, carrying the handshake, entity queries, all `RXDB_EVENT_TYPES`, branch operations, Storage metadata, and versioned provider messages. The debug window is not a second RxDB writer — it does not open SQLite directly and has no raw Tauri SQL / filesystem permissions; every capability is relayed through the connector in the main WebView, constrained by three layers: capability / descriptor / mutation policy.

- **Native storage integration**: the SQLite provider (`createDevToolsRxdbDatabaseProvider`) connects directly to the app's RxDB instance; the native files provider (`createDevToolsNativeFilesProvider`) exposes only the storage plugin's logical root — browse, refresh, upload, download, new directory, and delete; both desktop hosts share one settings provider (`createDevToolsDesktopSettingsProvider(runtime)`), and database downloads always return `export_unsupported`.
- **Three-state VFS mapping**: the wa-sqlite demo declares `files: opfs` / `settings: idb` — or structured unavailability — according to the backend the runtime **actually selected**; `runtime: tauri` is display-only and never guesses behavior from the adapter name or platform.
- **The idb tier goes through a dedicated Worker**: the forced idb tier (`DEV_RXDB_DEVTOOLS_FORCE_VFS=idb`) uses a dedicated Worker with the same shape as the opfs tier (`resolveWaSqliteIdbTransport`); the production path (not forced, browser falls back to IDB) keeps the SharedWorker so multiple tabs share one connection. On win32 the module SharedWorker's worker script never starts — measured as `timedOut` against a 60s watchdog — so the forced tier does not go through it.
- **Snapshots and errors**: 1001+ entries go through a bounded immutable snapshot honoring the deadline measured from request entry (`snapshot_busy` / `snapshot_too_large` / `snapshot_expired`); error responses keep stable categories and never leak absolute paths, SQL bound values, encrypted fields, or file contents.

### Electron: dev-variant extension and the desktop debugging flow (US-906)

Electron desktop app debugging goes through "http renderer + dev-variant extension". Two "plausible-looking" paths both fail in practice:

| Approach                                         | Measured result                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run the packaged artifact (`app://-/index.html`) | The custom `app:` scheme is not in Chromium's legal scheme set for extension match patterns; `permissionPatternForUrl` always returns `null`; the panel stops at "the current page does not support extension injection" |
| The `nx serve` http renderer                     | Electron has no `chrome.permissions` namespace; the production manifest's `optional_host_permissions` grant set is always empty — one **static** `host_permissions` entry is required for injection                      |

The **dev-variant extension** is the patch for the second path: a dev-only build variant (`build-desktop-dev` outputs `dist-desktop-dev/`) whose manifest differs from the release artifact **only** by adding `host_permissions: ["http://localhost/*"]` (the match pattern carries no port, so any port matches); the release manifest has neither `host_permissions` nor `web_accessible_resources`.

Developer flow (two terminals):

```bash npm2yarn
# Terminal 1: http renderer (default port 4120)
nx serve dev-rxdb-electron

# Terminal 2: start Electron in --serve mode
electron dist/apps/dev-rxdb-electron --serve
```

Then open the RxDB panel in DevTools: the state reaches `granted`, the four-stage relay handshake completes, and the Database page reads real entity rows.

:::warning `nx dev dev-rxdb-electron` does not work by itself
`dev` depends on the non-continuous `prepare-electron-package`; once `wait-on tcp:4120` succeeds, Nx tears the dev server down — which shows up as `ERR_CONNECTION_REFUSED`. The working shape is the two terminals above: `serve` holds 4120, and the other terminal runs the `electron` command directly.
:::

:::tip Troubleshooting: `registerSchemesAsPrivileged` is undefined
The VS Code integrated terminal launches electron as plain Node (any Electron host sets `ELECTRON_RUN_AS_NODE=1` on child processes). Fix with `env -u ELECTRON_RUN_AS_NODE electron dist/apps/dev-rxdb-electron --serve`.
:::

The packaged artifact (without `--serve`), even with the dev-variant extension loaded, **explains why** the panel cannot run (the current page's protocol is not in the injectable scheme set) and the state stays `unsupported` — the reason text holds for all hosts and does not hardcode Electron.

Four env switches for the dev configuration: `DEV_RXDB_DEVTOOLS`, `DEV_RXDB_DEVTOOLS_EXTENSION`, `DEV_RXDB_DEVTOOLS_CAPABILITY`, `DEV_RXDB_DEVTOOLS_MUTATION`; in production mode, with no `DEV_RXDB_DEVTOOLS*` set, no extension loads at all.

### Displaying bigint / binary (US-903)

QUERY_ENTITY, events, history/branches, and conflict payloads all go through the versioned DevTools serializer (`DEVTOOLS_WIRE_VERSION = 1`):

| Type     | Wire representation                                                      | Notes                                                                     |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `bigint` | `{ $rxdb: 1, type: 'bigint', value }`                                    | Exact decimal string, no precision loss                                   |
| `binary` | `{ $rxdb: 1, type: 'binary', encoding: 'base64url', value, byteLength }` | Encodes only the current `Uint8Array` view; the source array is untouched |

- Encrypted fields are **masked before serialization** (`[encrypted]`); no error path ever falls back to sending the raw value.
- The panel distinguishes bigint, number, binary, and ordinary objects; unknown envelope versions show unsupported instead of guessing a decode.
- This representation is only for the DevTools wire and display — not the entity write-back or change storage format.

## References

- [Getting Started](/getting-started/README.md)
- [Model definition](/model-definition/README.md)
- [Session recording and replay](/plugins/rxdb-plugin-replay/README.md)

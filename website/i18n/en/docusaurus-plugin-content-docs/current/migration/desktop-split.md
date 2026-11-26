# Desktop adapter split: `rxdb-adapter-desktop` → `-electron` / `-tauri`

`@aiao/rxdb-adapter-desktop` has been split into two packages by runtime, **effective from the next published version**:

| Old                                       | New                           |
| ----------------------------------------- | ----------------------------- |
| `@aiao/rxdb-adapter-desktop`              | `@aiao/rxdb-adapter-electron` |
| `@aiao/rxdb-adapter-desktop` (Tauri half) | `@aiao/rxdb-adapter-tauri`    |

The latest version published under the old package name is `0.0.25`. It will not be retracted and will **not be marked `deprecated`** — the old package stays on the registry and may keep receiving updates, so there will be no "deprecation warning at install time". Existing installs keep working; this guide, not registry metadata, drives the migration. Under the [versioning and API stability policy](/versioning.md), breaking changes are allowed in minor versions during 0.x.

**No data migration is involved.** The database files on disk, the logical database name derivation rule (`${dbName}.sqlite3`), the wire protocol version (`1`), the global key used for preload injection (`__aiaoRxdbDesktopHost__`), and all error codes — none of them changed. Only import paths, five symbol names, and the adapter registration name changed.

## Why split

One package carried the pieces of two runtimes: the host on the Electron side is written with `node:sqlite`, and the host on the Tauri side is Rust. As a result, a Tauri app that installed the package downloaded a Node host implementation it would never use, and an Electron app downloaded the Tauri transport; the release cadence of the two runtimes also dragged on each other.

The shared layer — the wire protocol, the renderer client, the storage configuration union, and the error types — moved down into `@aiao/rxdb-adapter-sqlite-core/desktop-host`, and both new packages re-export it unchanged. **Symbols imported by name therefore keep their import lines; only the package name changes.** Only when you write your own host or transport is there a reason to import that subpath directly.

## 1. Swap the package

```bash
# Electron
pnpm remove @aiao/rxdb-adapter-desktop
pnpm add @aiao/rxdb-adapter-electron

# Tauri
pnpm remove @aiao/rxdb-adapter-desktop
pnpm add @aiao/rxdb-adapter-tauri
```

The entry-point split is unchanged; only the package names changed:

| Purpose                             | Old                               | New                                |
| ----------------------------------- | --------------------------------- | ---------------------------------- |
| Renderer / WebView                  | `@aiao/rxdb-adapter-desktop`      | `@aiao/rxdb-adapter-electron`      |
| Electron main process / its workers | `@aiao/rxdb-adapter-desktop/host` | `@aiao/rxdb-adapter-electron/host` |
| Tauri WebView                       | `@aiao/rxdb-adapter-desktop`      | `@aiao/rxdb-adapter-tauri`         |

`@aiao/rxdb-adapter-tauri` has **no** `./host` subpath: that side is Rust, ships with the application binary, and is not distributed through npm.

## 2. The adapter registration name goes from one to two

This is the only runtime-visible breaking change.

```ts
// Old
import { DESKTOP_ADAPTER_NAME, RxDBAdapterDesktop } from '@aiao/rxdb-adapter-desktop';
// DESKTOP_ADAPTER_NAME === 'desktop'

// New (Electron)
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';
// ELECTRON_ADAPTER_NAME === 'sqlite-electron'

// New (Tauri)
import { RxDBAdapterTauri, TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
// TAURI_ADAPTER_NAME === 'sqlite-tauri'
```

The new names follow the repository's existing `<engine>-<runtime>` convention (like `wa-sqlite-miniprogram`). Keeping `'desktop'` was not an option: `RxDBAdapters` is a type table keyed by registration name, and two adapter classes sharing one key would overwrite each other.

Three places must change together — registration, `sync.local.adapter`, and `connect`:

```ts
const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: ELECTRON_ADAPTER_NAME } }
});

rxdb.adapter(ELECTRON_ADAPTER_NAME, async database => new RxDBAdapterElectron(database));
rxdb.init();
await rxdb.connect(ELECTRON_ADAPTER_NAME);
```

Wherever the constant was used, changing the import is enough. **Places that hardcode the string `'desktop'` need a manual search**: in TypeScript the compiler flags them (`'desktop'` is no longer a valid key of `RxDBAdapters`), but strings in JSON configs, environment variables, or templates are invisible to the compiler.

## 3. Removed and renamed symbols

Main entry (renderer / WebView):

| Old                                               | New                                            | Notes                                                                                 |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DESKTOP_ADAPTER_NAME`                            | `ELECTRON_ADAPTER_NAME` / `TAURI_ADAPTER_NAME` | The value changed too, see the previous section                                       |
| `RxDBAdapterDesktop`                              | `RxDBAdapterElectron` / `RxDBAdapterTauri`     | One class split into two, each bound to one runtime                                   |
| `assertSupportedDesktopStorage(runtime, storage)` | `assertDesktopSqliteStorage(storage)`          | One parameter fewer; the return type is an assertion signature that narrows the input |
| `DesktopRuntime`                                  | Removed                                        | The runtime is now determined by which package you import                             |
| `SupportedDesktopStorage<TRuntime>`               | Removed                                        | Same reason: the generic parameter has no values left                                 |
| `DesktopOptions.runtime`                          | Removed                                        | See the next section                                                                  |

The other 46 exports **keep their names unchanged**, of which 6 Tauri-only symbols (`createTauriHostTransport`, `TAURI_DESKTOP_REQUEST_COMMAND`, `TAURI_DESKTOP_CHANGE_EVENT`, `TauriHostTransportOptions`, `encodeDesktopJsonPayload`, `decodeDesktopJsonPayload`) exist only in the `-tauri` package. The `Desktop*` prefix on shared symbols is **deliberately kept** — they are the layer shared by both runtimes, and renaming them to `Electron*` would be inaccurate.

`./host` entry (Electron only):

| Old                                              | New                                                |
| ------------------------------------------------ | -------------------------------------------------- |
| `createDesktopSqliteHost`                        | `createElectronSqliteHost`                         |
| `DesktopSqliteHost` / `DesktopSqliteHostOptions` | `ElectronSqliteHost` / `ElectronSqliteHostOptions` |
| `createDesktopFileHost`                          | `createElectronFileHost`                           |
| `DesktopFileHost` / `DesktopFileHostOptions`     | `ElectronFileHost` / `ElectronFileHostOptions`     |
| `assertSupportedDesktopStorage`                  | `assertDesktopSqliteStorage`                       |
| `DesktopRuntime`                                 | Removed                                            |

`NodeSqliteEngine`, `RxDBAdapterDesktopError`, the protocol constants, and the protocol types keep their names in `./host`.

## 4. The `runtime` option is removed

```ts
// Old
new RxDBAdapterDesktop(database, { runtime: 'electron', databaseName: 'app.sqlite3' });

// New
new RxDBAdapterElectron(database, { databaseName: 'app.sqlite3' });
```

That field only ever affected the wording of the pre-connect capability matrix check: hosts never read it, since every host implementation is bound to one runtime. Removing it also removes a second source of truth — `runtime: 'tauri'` with an Electron host was a combination you could write but that meant nothing.

The Tauri side also tightened: `TauriOptions.transport` went from optional to **required**. Electron can omit it (preload uses `contextBridge` to hang the transport on a global key, and the adapter fetches it itself); Tauri has no preload layer, so that global key never exists. Under the old signature, omitting it cost a runtime `host_unavailable`, and only on the first query; now the same mistake surfaces at compile time.

## 5. Tauri users: the Rust host still does not ship with the package

`@aiao/rxdb-adapter-tauri` provides only `createTauriHostTransport` — a pipe connecting `invoke` / `listen` to the protocol. The `rusqlite` host on the other end of that pipe (the `rxdb_desktop_request` command, the engine, the session table) is **not in this npm package**; a Tauri app that installs the package must supply its own Rust host. This was true before the split and remains true after it; moving the Rust host into a publishable crate is separate work that has not started.

**When you upgrade the JS package, update your Rust host at the same time.** The renderer now sends a side-effect-free `handshake` **before** `open` to verify the protocol version (so a version mismatch does not leave an empty database file on disk). An old host that does not recognize this request replies `protocol_violation: unknown request kind handshake`; the adapter rethrows it to the caller and does **not** fall back to a direct `open` — the whole point of a version number is to forbid downgrades. Electron users usually never see this: both sides come from the same package version, unless your app bundles an older main-process build.

## 6. One-shot replacement

The changes are mechanical. Run a bulk replacement first, then let the type checker find the rest:

```bash
# Electron side. Use perl, not sed: `\b` and `-i` behave differently between GNU and BSD sed.
rg -l '@aiao/rxdb-adapter-desktop|Desktop(SqliteHost|FileHost)|RxDBAdapterDesktop\b' src/ \
  | xargs perl -pi \
    -e 's#\@aiao/rxdb-adapter-desktop/host#\@aiao/rxdb-adapter-electron/host#g;' \
    -e 's#\@aiao/rxdb-adapter-desktop#\@aiao/rxdb-adapter-electron#g;' \
    -e 's#\bDESKTOP_ADAPTER_NAME\b#ELECTRON_ADAPTER_NAME#g;' \
    -e 's#\bRxDBAdapterDesktop\b#RxDBAdapterElectron#g;' \
    -e 's#\bcreateDesktopSqliteHost\b#createElectronSqliteHost#g;' \
    -e 's#\bDesktopSqliteHost(Options)?\b#ElectronSqliteHost$1#g;' \
    -e 's#\bcreateDesktopFileHost\b#createElectronFileHost#g;' \
    -e 's#\bDesktopFileHost(Options)?\b#ElectronFileHost$1#g;' \
    -e 's#\bassertSupportedDesktopStorage\b#assertDesktopSqliteStorage#g;'

# The compiler finds the rest: the runtime option, 'desktop' strings, the assertDesktopSqliteStorage parameter count
pnpm tsc --noEmit
```

Do not replace `RxDBAdapterDesktopError` in the same pass — it was not renamed. The `\bRxDBAdapterDesktop\b` word boundary above already shields it (the `E` that follows is also a word character, so no boundary forms), but widening the pattern would hit it.

## See also

- [Versioning and API stability](/versioning.md): deprecation cycles and the public API surface
- [Compatibility matrix](/compatibility.md): Node / Electron / framework version mapping
- [Switching adapters and migrating data](/migration/adapters.md): read this when you are changing the storage backend, not just the package name

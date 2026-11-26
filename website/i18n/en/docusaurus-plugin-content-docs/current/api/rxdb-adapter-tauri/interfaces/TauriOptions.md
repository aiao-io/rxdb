# TauriOptions

Defined in: [packages/rxdb-adapter-tauri/src/tauri-options.interface.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-options.interface.ts#L23)

Tauri adapter options.

## Remarks

Differs from the shared [DesktopOptions](DesktopOptions.md) in exactly one place: `transport` is **required**.

The Electron side can omit it because the preload mounts the transport on a renderer global via
`contextBridge` and the adapter fetches it itself. Tauri has no preload layer — `invoke` / `listen`
are modules the renderer imports directly, and that global key will **never** exist. Keeping the
optional signature would make the cost of omitting it a runtime `host_unavailable` that only
explodes at the first query; making it required surfaces the same error at compile time.

Explicit injection has a second reason: US-505 requires the SQLite and file request families to
share the **same** transport so the host-side session table knows they belong to the same window. A
transport the adapter builds itself has nothing to share.

## Extends

- `Omit`&lt;[`DesktopOptions`](DesktopOptions.md), `"transport"`&gt;

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:38

Debounce window for change events (milliseconds); the host's default applies when omitted.

#### Remarks

Same meaning as the wasm adapters' option of the same name: consecutive writes within the window
merge into one dispatch. Tune it down to reduce response latency, up to reduce wakeups; regardless
of the setting, one batch accumulates at most `MAX_BATCH_WAIT_MS`.

#### Inherited from

[`DesktopOptions`](DesktopOptions.md).[`batchTimeout`](DesktopOptions.md#batchtimeout)

***

### databaseName? \{#databasename\}

```ts
databaseName?: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:30

Overrides the logical database name.

#### Remarks

When omitted, derived as `${rxdb.config.dbName}${DEFAULT_DATABASE_SUFFIX}`. It is a **logical name
within the app scope**, not a path; only the host knows the physical location (AC#3). Specify it
explicitly only when taking over an existing database, or when multiple RxDB instances share the
same file.

#### Inherited from

[`DesktopOptions`](DesktopOptions.md).[`databaseName`](DesktopOptions.md#databasename)

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, AdapterRepositoryConstructor<RxDBAdapterSqliteBase>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/sqlite-core.types.d.ts:92

#### Inherited from

[`DesktopOptions`](DesktopOptions.md).[`repositories`](DesktopOptions.md#repositories)

***

### transport \{#transport\}

```ts
readonly transport: DesktopHostTransport;
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-options.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-options.interface.ts#L30)

Transport for communicating with the Rust host, usually built by [createTauriHostTransport](../functions/createTauriHostTransport.md).

#### Remarks

The package itself does not depend on `@tauri-apps/api`: `invoke` / `listen` are injected by the
application, keeping the package runtime-agnostic.

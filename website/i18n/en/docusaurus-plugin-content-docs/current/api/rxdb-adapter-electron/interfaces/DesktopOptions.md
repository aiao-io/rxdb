# DesktopOptions

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:13

Desktop adapter options.

## Extends

- [`IRxDBAdapterOptions`](../../rxdb/type-aliases/IRxDBAdapterOptions.md)
- [`SqliteBaseOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBaseOptions.md)

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:38

Debounce window for change events (milliseconds); when omitted, the host's default is used.

#### Remarks

Same semantics as the wasm adapters' option of the same name: consecutive writes within the window merge into one dispatch.
Make it smaller to lower response latency, larger to reduce wakeups; however it is configured, one batch accumulates at most `MAX_BATCH_WAIT_MS`.

***

### databaseName? \{#databasename\}

```ts
databaseName?: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:30

Overrides the logical database name.

#### Remarks

When omitted, derived as `${rxdb.config.dbName}${DEFAULT_DATABASE_SUFFIX}`.
It is a **logical name within the app's scope**, not a path; only the host knows the physical location (AC#3).
Specify it explicitly only when taking over an existing database, or when several RxDB instances need to share the same file.

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, AdapterRepositoryConstructor<RxDBAdapterSqliteBase>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/sqlite-core.types.d.ts:92

#### Inherited from

[`SqliteBaseOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBaseOptions.md).[`repositories`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBaseOptions.md#repositories)

***

### transport? \{#transport\}

```ts
transport?: DesktopHostTransport;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-options.interface.d.ts:21

Transport used to communicate with the host.

#### Remarks

When omitted, read from the global injected by preload (see `resolveDesktopHostTransport`).
Passing it explicitly is mainly for tests and for hosts outside the renderer (workers, Node integration tests).

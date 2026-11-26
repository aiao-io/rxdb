# SqliteOptions

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L80)

SQLite adapter configuration interface

## Extends

- `SqliteOptionsBase`

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L67)

#### Default

```ts
16 (BALANCED) @see BATCH_TIMEOUT
```

#### Inherited from

`SqliteOptionsBase.batchTimeout`

---

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L64)

#### See

https://www.sqlite.org/pragma.html#pragma_cache_size

#### Default

```ts
51200;
```

#### Inherited from

`SqliteOptionsBase.cacheSizeKb`

---

### fsRoot? \{#fsroot\}

```ts
fsRoot?: FileSystemDirectoryHandle;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L36)

`fs-handle` only: root directory handle

#### Inherited from

`SqliteOptionsBase.fsRoot`

---

### idbLockPolicy? \{#idblockpolicy\}

```ts
idbLockPolicy?: "exclusive" | "shared" | "shared+hint";
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L42)

`idb` only: lock policy

#### Default

```ts
'shared+hint';
```

#### Inherited from

`SqliteOptions`.[`idbLockPolicy`](#idblockpolicy)

---

### idbLockTimeout? \{#idblocktimeout\}

```ts
idbLockTimeout?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L48)

`idb` only: lock timeout (milliseconds)

#### Default

```ts
Infinity;
```

#### Inherited from

`SqliteOptionsBase.idbLockTimeout`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L31)

Open read-only (`SQLITE_OPEN_READONLY`)

#### Inherited from

`SqliteOptionsBase.readonly`

---

### repositories? \{#repositories\}

```ts
repositories?: Record<string, SqliteRepositoryConstructor<RepositoryBase<RepositoryEntityType>>>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L81)

---

### sharedWorker? \{#sharedworker\}

```ts
sharedWorker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L52)

#### Inherited from

`SqliteOptionsBase.sharedWorker`

---

### sharedWorkerInstance? \{#sharedworkerinstance\}

```ts
sharedWorkerInstance?: SharedWorker;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L53)

#### Inherited from

`SqliteOptionsBase.sharedWorkerInstance`

---

### vfs? \{#vfs\}

```ts
vfs?: SupportVFS;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L21)

Storage preset. Defaults to `idb`

#### Inherited from

`SqliteOptionsBase.vfs`

---

### wasmUrl? \{#wasmurl\}

```ts
wasmUrl?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L26)

URL of the wasm file. When not provided, @subframe7536/sqlite-wasm uses its built-in default path

#### Inherited from

`SqliteOptionsBase.wasmUrl`

---

### worker? \{#worker\}

```ts
worker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L50)

#### Inherited from

`SqliteOptionsBase.worker`

---

### workerInstance? \{#workerinstance\}

```ts
workerInstance?: Worker;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L51)

#### Inherited from

`SqliteOptionsBase.workerInstance`

---

### workerOwnership? \{#workerownership\}

```ts
workerOwnership?: "caller" | "client";
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/sqlite.interface.ts#L61)

Lifecycle owner of the Worker transport.

`caller` (default) allows the same Worker to be reused after disconnect, and the caller is ultimately responsible for `terminate()`;
`client` terminates the Worker when the client proxy is released or initialization fails.

#### Inherited from

`SqliteOptions`.[`workerOwnership`](#workerownership)

# SqliteOptions

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L77)

wa-sqlite adapter configuration.

## Extends

- `SqliteOptionsBase`

## Properties

### async? \{#async\}

```ts
async?: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L29)

Which wasm build to load: `true` = asyncify (`wa-sqlite-async.wasm`), `false` = sync (`wa-sqlite.wasm`).

#### Remarks

When not specified, decided by the capabilities declared by the selected VFS. **For a VFS that supports both modes (such as `OPFSCoopSyncVFS`) the adapter cannot guess** —
if `wasmPath` points at the sync artifact you must explicitly pass `false`:
asyncify glue is import/export-incompatible with non-asyncify wasm, and mixing them fails at instantiation.

#### Inherited from

`SqliteOptionsBase.async`

***

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L67)

#### Default

```ts
16 (BALANCED) @see BATCH_TIMEOUT (exported from the package root)
```

#### Inherited from

`SqliteOptionsBase.batchTimeout`

***

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L65)

#### See

https://www.sqlite.org/pragma.html#pragma_cache_size

#### Default

```ts
51200
```

#### Inherited from

`SqliteOptionsBase.cacheSizeKb`

***

### locateFile? \{#locatefile\}

```ts
locateFile?: (name) => string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L63)

Custom wasm file resolution; the function reference is also part of the repeat-initialization identity.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`string`

#### Inherited from

`SqliteOptionsBase.locateFile`

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, SqliteRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L78)

***

### sharedWorker? \{#sharedworker\}

```ts
sharedWorker?: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L48)

Use a SharedWorker; must be provided together with [SqliteOptionsBase.sharedWorkerInstance](#sharedworkerinstance), and cannot be enabled at the same time as worker.

#### Inherited from

`SqliteOptionsBase.sharedWorker`

***

### sharedWorkerInstance? \{#sharedworkerinstance\}

```ts
sharedWorkerInstance?: SharedWorker;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L54)

An externally created SharedWorker.

#### Remarks

The adapter only uses its port and does not take over the SharedWorker's lifecycle.

#### Inherited from

`SqliteOptionsBase.sharedWorkerInstance`

***

### vfs? \{#vfs\}

```ts
vfs?: SupportVFS;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L20)

#### Inherited from

`SqliteOptionsBase.vfs`

***

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L38)

Full URL of the wasm artifact.

#### Remarks

Must match the build resolved by [SqliteOptionsBase.async](#async). When the file name clearly points at the opposite build,
an error is thrown before loading; data URIs / blobs / custom file names with hashes are exempt from the naming convention.
Use [SqliteOptionsBase.locateFile](#locatefile) if you need to take over resolution yourself.

#### Inherited from

`SqliteOptionsBase.wasmPath`

***

### worker? \{#worker\}

```ts
worker?: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L40)

Use a dedicated Worker; must be provided together with [SqliteOptionsBase.workerInstance](#workerinstance).

#### Inherited from

`SqliteOptionsBase.worker`

***

### workerInstance? \{#workerinstance\}

```ts
workerInstance?: Worker;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L46)

An externally created dedicated Worker.

#### Remarks

The adapter only uses the instance and does not take over `terminate()` ownership.

#### Inherited from

`SqliteOptionsBase.workerInstance`

***

### workerOwnership? \{#workerownership\}

```ts
workerOwnership?: "caller" | "client";
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L61)

Lifecycle owner of the Worker transport.

`caller` (default) keeps the thread for reuse by later connections; `client` terminates the dedicated Worker when the client proxy is released or initialization fails,
and releases the SharedWorker's root port.

#### Inherited from

`SqliteOptions`.[`workerOwnership`](#workerownership)

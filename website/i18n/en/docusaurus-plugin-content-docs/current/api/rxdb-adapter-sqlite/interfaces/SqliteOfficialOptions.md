# SqliteOfficialOptions

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L51)

Full options for the official sqlite-wasm adapter.

## Extends

- `SqliteOfficialOptionsBase`

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L31)

#### Default

```ts
16 (BALANCED) @see BATCH_TIMEOUT
```

#### Inherited from

`SqliteOfficialOptionsBase.batchTimeout`

***

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L29)

#### See

https://www.sqlite.org/pragma.html#pragma_cache_size

#### Default

```ts
51200
```

#### Inherited from

`SqliteOfficialOptionsBase.cacheSizeKb`

***

### locateFile? \{#locatefile\}

```ts
locateFile?: (name) => string;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L23)

Custom Emscripten resource location function; cannot be passed to a worker.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`string`

#### Remarks

Function identity participates in module cache determination: `sqliteLoad`'s module-level WASM cache compares `locateFile`
by reference, and only the same reference reuses the loaded module. Pass a stable module-level reference; a newly created
inline closure each time (even with identical source) is treated as a different configuration and reinitializes the WASM.

#### Inherited from

`SqliteOfficialOptionsBase.locateFile`

***

### opfs? \{#opfs\}

```ts
opfs?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L10)

Whether to use OPFS to persist the database.

#### Inherited from

`SqliteOfficialOptionsBase.opfs`

***

### opfsFallback? \{#opfsfallback\}

```ts
opfsFallback?: OpfsFallback;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L33)

Behavior when the OPFS database fails to open. @default 'throw'

#### See

Oo1ClientBase

#### Inherited from

`SqliteOfficialOptionsBase.opfsFallback`

***

### opfsProxyPath? \{#opfsproxypath\}

```ts
opfsProxyPath?: string;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L14)

Explicit URL of the OPFS proxy worker file.

#### Inherited from

`SqliteOfficialOptionsBase.opfsProxyPath`

***

### print? \{#print\}

```ts
print?: (msg) => void;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L25)

Handler for sqlite standard output; cannot be passed to a worker.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `msg` | `string` |

#### Returns

`void`

#### Inherited from

`SqliteOfficialOptionsBase.print`

***

### printErr? \{#printerr\}

```ts
printErr?: (msg) => void;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L27)

Handler for sqlite standard error output; cannot be passed to a worker.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `msg` | `string` |

#### Returns

`void`

#### Inherited from

`SqliteOfficialOptionsBase.printErr`

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, SqliteOfficialRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L53)

Overrides the default Repository / TreeRepository constructors by entity name.

***

### sharedWorker? \{#sharedworker\}

```ts
sharedWorker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L39)

Whether to run the client in a shared worker.

#### Inherited from

`SqliteOfficialOptionsBase.sharedWorker`

***

### sharedWorkerInstance? \{#sharedworkerinstance\}

```ts
sharedWorkerInstance?: SharedWorker;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L41)

A shared worker created and owned by the caller.

#### Inherited from

`SqliteOfficialOptionsBase.sharedWorkerInstance`

***

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L12)

Explicit URL of the sqlite WASM file.

#### Inherited from

`SqliteOfficialOptionsBase.wasmPath`

***

### worker? \{#worker\}

```ts
worker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L35)

Whether to run the client in a dedicated worker.

#### Inherited from

`SqliteOfficialOptionsBase.worker`

***

### workerInstance? \{#workerinstance\}

```ts
workerInstance?: Worker;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L37)

A dedicated worker created and owned by the caller; the adapter does not terminate it on the caller's behalf when disconnecting.

#### Inherited from

`SqliteOfficialOptionsBase.workerInstance`

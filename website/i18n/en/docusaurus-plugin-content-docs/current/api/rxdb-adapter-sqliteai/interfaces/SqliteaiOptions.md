# SqliteaiOptions

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L49)

The complete SqliteAI adapter options (including an optional custom Repository registry).

## Extends

- `SqliteaiOptionsBase`

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L30)

#### Default

```ts
16 (BALANCED) @see BATCH_TIMEOUT
```

#### Inherited from

`SqliteaiOptionsBase.batchTimeout`

***

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L28)

#### See

https://www.sqlite.org/pragma.html#pragma_cache_size

#### Default

```ts
51200
```

#### Inherited from

`SqliteaiOptionsBase.cacheSizeKb`

***

### locateFile? \{#locatefile\}

```ts
locateFile?: (name) => string;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L24)

The custom Emscripten resource locator function; cannot be passed to a worker.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`string`

#### Remarks

Function identity participates in module cache judgment: `sqliteaiLoad`'s
module-level WASM cache compares `locateFile` by reference, and the loaded
module is reused only when the same reference is passed. Pass a module-level
stable reference; every newly created inline closure (even with identical
source) is treated as a different configuration and reinitializes the WASM.

#### Inherited from

`SqliteaiOptionsBase.locateFile`

***

### opfs? \{#opfs\}

```ts
opfs?: boolean;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L13)

#### Inherited from

`SqliteaiOptionsBase.opfs`

***

### opfsFallback? \{#opfsfallback\}

```ts
opfsFallback?: OpfsFallback;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L32)

The behavior when opening the OPFS database fails. @default 'throw'

#### See

Oo1ClientBase

#### Inherited from

`SqliteaiOptionsBase.opfsFallback`

***

### opfsProxyPath? \{#opfsproxypath\}

```ts
opfsProxyPath?: string;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L15)

#### Inherited from

`SqliteaiOptionsBase.opfsProxyPath`

***

### print? \{#print\}

```ts
print?: (msg) => void;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L25)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `msg` | `string` |

#### Returns

`void`

#### Inherited from

`SqliteaiOptionsBase.print`

***

### printErr? \{#printerr\}

```ts
printErr?: (msg) => void;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L26)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `msg` | `string` |

#### Returns

`void`

#### Inherited from

`SqliteaiOptionsBase.printErr`

***

### repositories? \{#repositories\}

```ts
repositories?: Record<string, SqliteaiRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L50)

***

### sharedWorker? \{#sharedworker\}

```ts
sharedWorker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L35)

#### Inherited from

`SqliteaiOptionsBase.sharedWorker`

***

### sharedWorkerInstance? \{#sharedworkerinstance\}

```ts
sharedWorkerInstance?: SharedWorker;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L36)

#### Inherited from

`SqliteaiOptionsBase.sharedWorkerInstance`

***

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L14)

#### Inherited from

`SqliteaiOptionsBase.wasmPath`

***

### worker? \{#worker\}

```ts
worker?: boolean;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L33)

#### Inherited from

`SqliteaiOptionsBase.worker`

***

### workerInstance? \{#workerinstance\}

```ts
workerInstance?: Worker;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L34)

#### Inherited from

`SqliteaiOptionsBase.workerInstance`

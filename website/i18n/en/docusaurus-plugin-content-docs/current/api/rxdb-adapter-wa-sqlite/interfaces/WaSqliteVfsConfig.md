# WaSqliteVfsConfig

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L24)

Read-only capabilities and loading configuration of a wa-sqlite VFS.

## Properties

### async \{#async\}

```ts
readonly async: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L34)

Whether the asyncify wasm build is supported.

***

### jsContext \{#jscontext\}

```ts
readonly jsContext: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L40)

Whether ordinary JavaScript contexts such as Window are supported.

***

### multipleConnections \{#multipleconnections\}

```ts
readonly multipleConnections: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L42)

Whether multiple connections can share the same storage.

***

### name \{#name\}

```ts
readonly name: SupportVFS;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L26)

Preset name of the VFS.

***

### sharedWorker \{#sharedworker\}

```ts
readonly sharedWorker: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L38)

Whether SharedWorker is supported.

***

### sync \{#sync\}

```ts
readonly sync: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L32)

Whether the sync wasm build is supported.

***

### vfsModule \{#vfsmodule\}

```ts
readonly vfsModule: () => Promise<WaSqliteVfsFactory>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L28)

Loads the upstream VFS factory.

#### Returns

`Promise`&lt;[`WaSqliteVfsFactory`](WaSqliteVfsFactory.md)&gt;

***

### vfsOptions? \{#vfsoptions\}

```ts
readonly vfsOptions?: Readonly<{
  lockPolicy?: string;
  lockTimeout?: number;
}>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L30)

Fixed options passed to the VFS factory.

***

### worker \{#worker\}

```ts
readonly worker: boolean;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L36)

Whether dedicated Worker is supported.

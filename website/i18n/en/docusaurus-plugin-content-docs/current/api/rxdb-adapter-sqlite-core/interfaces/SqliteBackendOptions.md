# SqliteBackendOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L35)

Options for opening the SQLite backend.

## Properties

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L45)

SQLite page cache size (KB, default 51200)

---

### locateFile? \{#locatefile\}

```ts
locateFile?: (name) => string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L43)

WASM file path resolver

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`string`

---

### opfs? \{#opfs\}

```ts
opfs?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L39)

Enables OPFS persistence (Worker only)

---

### vfs? \{#vfs\}

```ts
vfs?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L37)

Virtual file system name

---

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L41)

Custom WASM file path

# Oo1LoadOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L22)

`oo1` WASM load options, shared by all sqlite/sqliteai adapters.

`oo1` refers to the upstream official SQLite WASM **Object Oriented API v1** (`sqlite3.oo1.DB`), not an rxdb-coined abbreviation; this file only serves the `@sqlite.org/sqlite-wasm` / `@sqliteai/sqlite-wasm` load paths that use that interface.

- `opfs`: whether to enable OPFS persistence (requires Worker / Atomics support)
- `wasmPath`: manually specify the sqlite3.wasm URL, overriding the default relative path
- `opfsProxyPath`: custom path for the OPFS proxy worker script (used by bundler rewrites)
- `locateFile`: fully custom resource resolution logic, highest priority
- `print` / `printErr`: override the default logging channels
- `cacheSizeKb` / `batchTimeout`: passed through to SqliteClient initialization

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L30)

---

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L29)

---

### locateFile? \{#locatefile\}

```ts
locateFile?: (name) => string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L26)

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

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L23)

---

### opfsProxyPath? \{#opfsproxypath\}

```ts
opfsProxyPath?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L25)

---

### print? \{#print\}

```ts
print?: (msg) => void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L27)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `msg`     | `string` |

#### Returns

`void`

---

### printErr? \{#printerr\}

```ts
printErr?: (msg) => void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L28)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `msg`     | `string` |

#### Returns

`void`

---

### wasmPath? \{#wasmpath\}

```ts
wasmPath?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L24)

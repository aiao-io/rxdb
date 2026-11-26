# Oo1LoadFingerprint

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L268)

Configuration fingerprint that decides "which WASM module gets loaded".

## Remarks

SQLI-001 / SQLAI-001: both official adapters cache `Oo1Static` as a module-level singleton, but the cache key only records "whether the OPFS proxy patch was used" — after the first initialization with `/a/sqlite.wasm`, a second client explicitly passing `/b/sqlite.wasm` would **silently get the first module**; two different proxy URLs both hit the same cache as long as both enable the patch.

Only fields that **actually decide what gets loaded** are included here. `print` / `printErr` are module-level logging channels and do not affect which binary is loaded, so they do not participate in the fingerprint (they take effect on the first load; values passed in later calls are ignored). `locateFile` is compared by **function identity**: the same callback reuses, a different callback (even another closure with identical source) reloads — functions cannot be compared by value, but reference equality is reliable; comparing only "whether one was provided" would leave the second callback never called even once.

## Properties

### hasLocateFile \{#haslocatefile\}

```ts
readonly hasLocateFile: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L272)

---

### locateFile? \{#locatefile\}

```ts
readonly locateFile?: (name) => string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L274)

The caller's `locateFile` callback itself, compared by reference; `undefined` when not provided

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`string`

---

### opfs \{#opfs\}

```ts
readonly opfs: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L269)

---

### opfsProxyPath \{#opfsproxypath\}

```ts
readonly opfsProxyPath: string | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L271)

---

### wasmPath \{#wasmpath\}

```ts
readonly wasmPath: string | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L270)

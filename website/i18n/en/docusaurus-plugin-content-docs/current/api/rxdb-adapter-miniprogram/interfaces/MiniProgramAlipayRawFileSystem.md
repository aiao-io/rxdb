# MiniProgramAlipayRawFileSystem

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L22)

The raw shape of the Alipay synchronous file system: every method returns a result object and does not throw on failure.

There is no `openSync` / `readSync` / `writeSync` / `truncateSync`; only whole-file reads and writes are possible (measured on both ends).

## Methods

### accessSync() \{#accesssync\}

```ts
accessSync(path): unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L23)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`unknown`

---

### mkdirSync() \{#mkdirsync\}

```ts
mkdirSync(path, recursive?): unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L24)

#### Parameters

| Parameter    | Type      |
| ------------ | --------- |
| `path`       | `string`  |
| `recursive?` | `boolean` |

#### Returns

`unknown`

---

### readFileSync() \{#readfilesync\}

```ts
readFileSync(path, encoding?): unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L26)

Without `encoding` it reads binary; on success `data` is an `ArrayBuffer` (possibly from another realm); with `'utf8'` it is a string.

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `path`      | `string` |
| `encoding?` | `string` |

#### Returns

`unknown`

---

### unlinkSync() \{#unlinksync\}

```ts
unlinkSync(path): unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L29)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`unknown`

---

### writeFileSync() \{#writefilesync\}

```ts
writeFileSync(
   path,
   data,
   encoding
): unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L28)

Only "base64 string + `'base64'`" is byte-identical on both ends; `ArrayBuffer` is stored by the simulator as base64 text, and `Uint8Array` silently writes 0 bytes on iOS.

#### Parameters

| Parameter  | Type       |
| ---------- | ---------- |
| `path`     | `string`   |
| `data`     | `string`   |
| `encoding` | `"base64"` |

#### Returns

`unknown`

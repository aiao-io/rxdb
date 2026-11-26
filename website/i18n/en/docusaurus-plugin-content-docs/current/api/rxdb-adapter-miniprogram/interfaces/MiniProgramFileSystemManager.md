# MiniProgramFileSystemManager

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L5)

The minimal contract of the WeChat mini program synchronous file system.

## Methods

### accessSync() \{#accesssync\}

```ts
accessSync(path): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L6)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`void`

---

### mkdirSync() \{#mkdirsync\}

```ts
mkdirSync(path, recursive?): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L7)

#### Parameters

| Parameter    | Type      |
| ------------ | --------- |
| `path`       | `string`  |
| `recursive?` | `boolean` |

#### Returns

`void`

---

### readFileSync() \{#readfilesync\}

```ts
readFileSync(path, encoding): string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L8)

#### Parameters

| Parameter  | Type       |
| ---------- | ---------- |
| `path`     | `string`   |
| `encoding` | `"base64"` |

#### Returns

`string`

---

### unlinkSync() \{#unlinksync\}

```ts
unlinkSync(path): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L9)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`void`

---

### writeFileSync() \{#writefilesync\}

```ts
writeFileSync(path, data): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L10)

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `path`    | `string`      |
| `data`    | `ArrayBuffer` |

#### Returns

`void`

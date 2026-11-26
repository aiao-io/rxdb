# MiniProgramAlipayApi

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L33)

The members of the global `my` that the Alipay host needs.

## Properties

### env? \{#env\}

```ts
readonly env?: object;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L34)

#### USER\_DATA\_PATH?

```ts
readonly USER_DATA_PATH?: string;
```

## Methods

### arrayBufferToBase64() \{#arraybuffertobase64\}

```ts
arrayBufferToBase64(buffer): string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L36)

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `buffer`  | `ArrayBuffer` |

#### Returns

`string`

---

### base64ToArrayBuffer() \{#base64toarraybuffer\}

```ts
base64ToArrayBuffer(base64): ArrayBuffer;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L37)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `base64`  | `string` |

#### Returns

`ArrayBuffer`

---

### getFileSystemManager() \{#getfilesystemmanager\}

```ts
getFileSystemManager(): MiniProgramAlipayRawFileSystem;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L35)

#### Returns

[`MiniProgramAlipayRawFileSystem`](MiniProgramAlipayRawFileSystem.md)

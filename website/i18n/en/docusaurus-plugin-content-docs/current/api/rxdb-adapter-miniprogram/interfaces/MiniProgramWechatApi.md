# MiniProgramWechatApi

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L27)

The WeChat runtime capabilities the adapter needs.

## Properties

### env \{#env\}

```ts
readonly env: object;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L28)

#### USER\_DATA\_PATH

```ts
readonly USER_DATA_PATH: string;
```

## Methods

### getFileSystemManager() \{#getfilesystemmanager\}

```ts
getFileSystemManager(): MiniProgramFileSystemManager;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L29)

#### Returns

[`MiniProgramFileSystemManager`](MiniProgramFileSystemManager.md)

---

### getRandomValues()? \{#getrandomvalues\}

```ts
getRandomValues ? options : unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L30)

#### Parameters

| Parameter | Type                             |
| --------- | -------------------------------- |
| `options` | `MiniProgramRandomValuesOptions` |

#### Returns

`unknown`

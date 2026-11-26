# MiniProgramDouyinApi

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L39)

The Douyin runtime capabilities the adapter needs (the global `tt`).

The user directory comes from `tt.getEnvInfoSync()` (base library 2.21.0+), not `tt.env`: Douyin has marked `tt.env` as deprecated,
and the developer tools print a deprecation warning on every read of `tt.env.USER_DATA_PATH`. It is named separately so that an object that merely "looks like `wx`" cannot impersonate another platform.

## Methods

### getEnvInfoSync() \{#getenvinfosync\}

```ts
getEnvInfoSync(): object;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L41)

Gets environment info synchronously; only `common.USER_DATA_PATH` is used (default `ttfile://user`). Platform-native exceptions are rethrown unchanged.

#### Returns

`object`

##### common

```ts
readonly common: object;
```

###### common.USER\_DATA\_PATH

```ts
readonly USER_DATA_PATH: string;
```

***

### getFileSystemManager() \{#getfilesystemmanager\}

```ts
getFileSystemManager(): MiniProgramFileSystemManager;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L42)

#### Returns

[`MiniProgramFileSystemManager`](MiniProgramFileSystemManager.md)

***

### getRandomValues()? \{#getrandomvalues\}

```ts
getRandomValues?(options): unknown;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L43)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `MiniProgramRandomValuesOptions` |

#### Returns

`unknown`

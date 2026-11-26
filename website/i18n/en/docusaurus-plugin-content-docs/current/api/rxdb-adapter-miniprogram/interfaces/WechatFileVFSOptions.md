# WechatFileVFSOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L95)

WeChat file VFS config.

## Properties

### databaseName \{#databasename\}

```ts
databaseName: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L101)

The name used to clean up the database file.

***

### fileSystem? \{#filesystem\}

```ts
fileSystem?: MiniProgramFileSystemManager;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L105)

A file system injected for tests or by the host.

***

### name? \{#name\}

```ts
name?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L103)

The VFS name.

***

### root? \{#root\}

```ts
root?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L99)

The database file directory.

***

### wechat \{#wechat\}

```ts
wechat: MiniProgramWechatApi;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L97)

The WeChat mini program global `wx`.

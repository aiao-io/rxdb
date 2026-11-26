# MiniProgramFileVFSOptions

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L109)

Platform-agnostic mini program file VFS config.

## Properties

### databaseName \{#databasename\}

```ts
databaseName: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L115)

The name used to clean up the database file.

---

### fileSystem? \{#filesystem\}

```ts
fileSystem?: MiniProgramFileSystemManager;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L119)

A file system injected for tests or by the host, taking precedence over `host.getFileSystemManager()`.

---

### host \{#host\}

```ts
host: MiniProgramHost;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L111)

The mini program host, providing the synchronous file system, the default directory and the error names.

---

### name? \{#name\}

```ts
name?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L117)

The VFS name. Defaults to `${host.platform}-file`.

---

### root? \{#root\}

```ts
root?: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L113)

The database file directory. Defaults to `${host.userDataPath}/rxdb-wa-sqlite`.

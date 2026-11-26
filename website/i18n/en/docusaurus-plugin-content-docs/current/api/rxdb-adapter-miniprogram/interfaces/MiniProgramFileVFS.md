# MiniProgramFileVFS

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L123)

Mini program synchronous file VFS handle.

## Properties

### lastError \{#lasterror\}

```ts
readonly lastError: Error | null;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L126)

---

### reserveHeld \{#reserveheld\}

```ts
readonly reserveHeld: boolean;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L133)

Whether the rollback headroom is held. Only the chunked layout holds it; the single-file layout is always false.

2×`chunkBytes` is reserved before creating the main journal, and yielded to rollback when the quota is hit. Failing to reserve (quota already full) does not block opening,
but rollback after hitting the quota may then have no room, and callers decide from this whether to free up space first.

---

### root \{#root\}

```ts
readonly root: string;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L125)

---

### vfs \{#vfs\}

```ts
readonly vfs: SQLiteVFS;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L124)

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L134)

#### Returns

`void`

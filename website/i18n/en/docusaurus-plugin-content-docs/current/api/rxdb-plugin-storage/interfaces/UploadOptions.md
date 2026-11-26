# UploadOptions

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L45)

File upload options.

## Properties

### overwrite? \{#overwrite\}

```ts
overwrite?: boolean;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L49)

Whether to replace the content in place and increment `contentVersion` when the same path already exists.

***

### path? \{#path\}

```ts
path?: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L47)

The target directory; defaults to the root directory `/`.

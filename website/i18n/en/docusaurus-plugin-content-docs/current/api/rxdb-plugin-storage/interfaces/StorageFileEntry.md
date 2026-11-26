# StorageFileEntry

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L148)

The file entry returned when browsing a directory.

## Properties

### kind \{#kind\}

```ts
kind: "file";
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L150)

The file tag for the discriminated union.

***

### meta \{#meta\}

```ts
meta: StorageFileMeta;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L156)

The persisted metadata corresponding to the OPFS file.

***

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L152)

The file name.

***

### path \{#path\}

```ts
path: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L154)

The storage absolute path starting with `/`.

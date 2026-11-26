# ListOptions

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L59)

Metadata list query options.

## Properties

### path? \{#path\}

```ts
path?: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L68)

The directory to list; omitted means the whole database.

#### Remarks

`''` and `'/'` are equivalent and both mean the root directory — both are
normalized to `'/'` by [normalizeDirectoryPath](../functions/normalizeDirectoryPath.md).
For "the root directory and all its subdirectories", pass
[ListOptions.recursive](#recursive) explicitly and do not express it by
omitting `path` (STOR-005).

***

### recursive? \{#recursive\}

```ts
recursive?: boolean;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L76)

Whether to also return subdirectories.

#### Default Value

false (only the direct files under `path`)

#### Remarks

Meaningless when `path` is omitted: without a directory restriction, all
metadata in the whole database is returned anyway.

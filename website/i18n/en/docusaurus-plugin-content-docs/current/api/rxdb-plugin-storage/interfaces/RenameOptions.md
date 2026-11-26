# RenameOptions

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L86)

File or directory rename options.

## Properties

### overwrite? \{#overwrite\}

```ts
overwrite?: boolean;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L92)

Whether to fully replace a target with the same name.

File replacement keeps the source metadata ID; directory replacement deletes
files and metadata unique to the target and never merges the trees.

# StorageFilesystemEntry

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L23)

A directory entry: exposes only the name and type the service layer needs, leaking no underlying handle.

## Properties

### kind \{#kind\}

```ts
readonly kind: "directory" | "file";
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L27)

The entry type.

---

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L25)

The entry's name within its owning directory (logical name, already decoded by the implementor).

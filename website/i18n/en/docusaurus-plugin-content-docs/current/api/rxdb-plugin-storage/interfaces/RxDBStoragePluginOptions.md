# RxDBStoragePluginOptions

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L30)

Storage plugin installation options.

## Properties

### filesystem? \{#filesystem\}

```ts
filesystem?: StorageFilesystemFactory;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L41)

The backend factory used to persist file contents; omitted means the browser OPFS.

#### Remarks

Desktop hosts use it to write contents into the application data directory
(US-504), keeping metadata and files in one backup domain.

---

### previewLimitBytes? \{#previewlimitbytes\}

```ts
previewLimitBytes?: number;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L34)

The maximum bytes allowed for creating a preview URL; defaults to 50 MiB.

---

### rootDir? \{#rootdir\}

```ts
rootDir?: string;
```

Defined in: [packages/rxdb-plugin-storage/src/storage.helpers.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/storage.helpers.ts#L32)

The storage root directory name; defaults to `files`.

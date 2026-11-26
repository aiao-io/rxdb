# StorageFilesystemFactory

```ts
type StorageFilesystemFactory = (rootDir, context) => StorageFilesystem;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L172)

The factory that creates a backend instance for a storage root directory.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rootDir` | `string` | The already-normalized storage root relative path (e.g. `files`). |
| `context` | [`StorageFilesystemContext`](../interfaces/StorageFilesystemContext.md) | Host information, for the backend to run pre-enable validation. |

## Returns

[`StorageFilesystem`](../interfaces/StorageFilesystem.md)

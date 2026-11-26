# joinDirectoryAndFileName()

```ts
function joinDirectoryAndFileName(directoryPath, fileName): string;
```

Defined in: [packages/rxdb-plugin-storage/src/paths.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/paths.ts#L121)

Joins a storage directory and a file name, returning the OPFS-relative path.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `directoryPath` | `string` \| `undefined` |
| `fileName` | `string` |

## Returns

`string`

## Throws

[StorageInvalidPathError](../classes/StorageInvalidPathError.md) is thrown when
the directory or file name is illegal.

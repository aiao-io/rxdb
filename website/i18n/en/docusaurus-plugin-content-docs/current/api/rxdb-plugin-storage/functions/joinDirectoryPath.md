# joinDirectoryPath()

```ts
function joinDirectoryPath(directoryPath, directoryName): string;
```

Defined in: [packages/rxdb-plugin-storage/src/paths.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/paths.ts#L135)

Joins a parent directory and a subdirectory name, returning the storage absolute path.

## Parameters

| Parameter       | Type                    |
| --------------- | ----------------------- |
| `directoryPath` | `string` \| `undefined` |
| `directoryName` | `string`                |

## Returns

`string`

## Throws

[StorageInvalidPathError](../classes/StorageInvalidPathError.md) is thrown when
any path segment is illegal.

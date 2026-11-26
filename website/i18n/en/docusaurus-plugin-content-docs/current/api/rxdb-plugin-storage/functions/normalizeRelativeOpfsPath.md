# normalizeRelativeOpfsPath()

```ts
function normalizeRelativeOpfsPath(path): string;
```

Defined in: [packages/rxdb-plugin-storage/src/paths.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/paths.ts#L94)

Normalizes a storage path to an OPFS-relative path without a leading `/`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

## Returns

`string`

## Throws

[StorageInvalidPathError](../classes/StorageInvalidPathError.md) is thrown when
the path contains an illegal segment.

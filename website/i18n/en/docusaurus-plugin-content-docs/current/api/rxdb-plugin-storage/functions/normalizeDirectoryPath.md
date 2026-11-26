# normalizeDirectoryPath()

```ts
function normalizeDirectoryPath(path?): string;
```

Defined in: [packages/rxdb-plugin-storage/src/paths.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/paths.ts#L60)

Normalizes a directory path to the form starting with `/` and without a trailing `/`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` |

## Returns

`string`

## Throws

[StorageInvalidPathError](../classes/StorageInvalidPathError.md) is thrown when
the path contains an empty segment, a backslash, `.`, `..`, or leading/trailing whitespace.

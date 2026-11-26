# getFileExtension()

```ts
function getFileExtension(filename): string;
```

Defined in: [packages/utils/src/file/index.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/file/index.ts#L40)

Gets a file name's extension, lowercased and without the dot.

First strips the directory part before `/` or `\`, then finds the last dot. Files starting with a dot and containing no other dots (`.bashrc`) are treated as having **no extension**.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filename` | `string` | The file name or path |

## Returns

`string`

The lowercased extension; returns the empty string `''` when there is no extension, without throwing

## Example

```ts
getFileExtension('a/b/C.PNG'); // 'png'
getFileExtension('.bashrc');   // ''
```

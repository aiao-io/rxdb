# isPreviewableType()

```ts
function isPreviewableType(filename): boolean;
```

Defined in: [packages/utils/src/file/index.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/file/index.ts#L57)

Determines whether a file is of a previewable type (image / audio / video / code / text).

Looks only at the extension and does not read file contents, so renaming changes the verdict.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filename` | `string` | File name or path |

## Returns

`boolean`

`true` when the extension is in the previewable whitelist; `false` when there is no extension or it is not listed

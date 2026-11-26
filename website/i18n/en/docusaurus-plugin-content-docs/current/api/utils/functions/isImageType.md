# isImageType()

```ts
function isImageType(filename): boolean;
```

Defined in: [packages/utils/src/file/index.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/file/index.ts#L70)

Checks whether a file is an image.

Only checks the extension; does not read file contents and does no MIME sniffing.

## Parameters

| Parameter  | Type     | Description           |
| ---------- | -------- | --------------------- |
| `filename` | `string` | The file name or path |

## Returns

`boolean`

`true` if the extension belongs to an image, otherwise `false`

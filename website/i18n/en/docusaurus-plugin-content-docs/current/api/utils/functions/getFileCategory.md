# getFileCategory()

```ts
function getFileCategory(filename): "image" | "audio" | "video" | "code" | "text" | "archive" | "unknown";
```

Defined in: [packages/utils/src/file/index.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/file/index.ts#L83)

Categorizes files by extension.

Categories are mutually exclusive and matched in a **fixed order**: image → audio → video → code → text → archive. An extension appearing in multiple sets (e.g. `ogg` is both audio and video) lands in the earlier category.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filename` | `string` | File name or path |

## Returns

`"image"` \| `"audio"` \| `"video"` \| `"code"` \| `"text"` \| `"archive"` \| `"unknown"`

The category name; returns `'unknown'` when there is no extension or it is in no set

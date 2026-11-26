# decompressFromBase64Url()

```ts
function decompressFromBase64Url(value, format?): Promise<string>;
```

Defined in: [packages/utils/src/string/decompressFromBase64Url.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/decompressFromBase64Url.ts#L9)

Decompresses a string from URL-safe Base64

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `value` | `string` | `undefined` | The URL-safe Base64 string |
| `format?` | `"deflate"` \| `"deflate-raw"` \| `"gzip"` | `'deflate'` | The compression format |

## Returns

`Promise`&lt;`string`&gt;

The decompressed string

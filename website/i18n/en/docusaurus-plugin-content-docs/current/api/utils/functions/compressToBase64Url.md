# compressToBase64Url()

```ts
function compressToBase64Url(value, format?): Promise<string>;
```

Defined in: [packages/utils/src/string/compressToBase64Url.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/compressToBase64Url.ts#L9)

Compresses a string to URL-safe Base64

## Parameters

| Parameter | Type                                       | Default value | Description            |
| --------- | ------------------------------------------ | ------------- | ---------------------- |
| `value`   | `string`                                   | `undefined`   | The string to compress |
| `format?` | `"deflate"` \| `"deflate-raw"` \| `"gzip"` | `'deflate'`   | Compression format     |

## Returns

`Promise`&lt;`string`&gt;

URL-safe Base64 string

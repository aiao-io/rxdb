# base64Encode()

```ts
function base64Encode(value): string;
```

Defined in: [packages/utils/src/crypto/base64Encode.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/base64Encode.ts#L36)

Encodes UTF-8 text or byte data as Base64.

## Parameters

| Parameter | Type                                                                             | Description               |
| --------- | -------------------------------------------------------------------------------- | ------------------------- |
| `value`   | `string` \| `number`[] \| `ArrayBuffer` \| `Uint8Array`&lt;`ArrayBufferLike`&gt; | UTF-8 string or byte data |

## Returns

`string`

Base64 string

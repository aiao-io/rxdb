# encodeCanonicalBase64()

```ts
function encodeCanonicalBase64(bytes): string;
```

Defined in: [v2/base64.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/base64.ts#L62)

Encodes a byte sequence as RFC 4648 standard base64 (with canonical padding).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `bytes` | `Uint8Array` | The bytes to encode. |

## Returns

`string`

A canonical base64 string; an empty input yields an empty string.

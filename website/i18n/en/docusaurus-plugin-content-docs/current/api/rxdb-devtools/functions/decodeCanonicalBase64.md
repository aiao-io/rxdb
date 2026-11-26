# decodeCanonicalBase64()

```ts
function decodeCanonicalBase64(value): Uint8Array<ArrayBufferLike> | undefined;
```

Defined in: [v2/base64.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/base64.ts#L85)

Decodes RFC 4648 standard base64 and requires the input to be the **canonical** encoding of that byte sequence.

## Parameters

| Parameter | Type      | Description                                                               |
| --------- | --------- | ------------------------------------------------------------------------- |
| `value`   | `unknown` | The value to decode; anything that is not a string is treated as invalid. |

## Returns

`Uint8Array`&lt;`ArrayBufferLike`&gt; \| `undefined`

The decoded bytes; `undefined` when the input is non-canonical.

## Remarks

Returns `undefined` instead of throwing: the caller (the transfer state machine) must translate it into `payload_encoding_invalid` and return it **before refreshing the idle deadline**, and an exception path would make that ordering harder to guarantee.

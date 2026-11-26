# uint8ArrayToString()

```ts
function uint8ArrayToString(u8): string;
```

Defined in: [packages/utils/src/binary/uint8ArrayToString.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/binary/uint8ArrayToString.ts#L14)

Converts a Uint8Array to a UTF-8 string
Uses the TextDecoder API to decode, ensuring multi-byte characters are handled correctly

## Parameters

| Parameter | Type         | Description                        |
| --------- | ------------ | ---------------------------------- |
| `u8`      | `Uint8Array` | The Uint8Array instance to convert |

## Returns

`string`

The decoded UTF-8 string
**Note:** uses the default UTF-8 encoding; other character encodings are not supported

## Example

```ts
const bytes = new Uint8Array([72, 101, 108, 108, 111]);
uint8ArrayToString(bytes); // returns 'Hello'
```

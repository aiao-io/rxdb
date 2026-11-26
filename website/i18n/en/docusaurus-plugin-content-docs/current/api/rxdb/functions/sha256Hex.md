# sha256Hex()

```ts
function sha256Hex(message): string;
```

Defined in: [packages/rxdb/src/system/sha256.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sha256.ts#L133)

Computes the SHA-256 of a span of bytes.

## Parameters

| Parameter | Type         | Description                             |
| --------- | ------------ | --------------------------------------- |
| `message` | `Uint8Array` | The bytes to digest; **never** modified |

## Returns

`string`

64 characters of lowercase hex

## Remarks

Synchronous, stateless, reentrant: each call carries its own state array and message schedule table, so two concurrent calls do not affect each other.

The input is **bytes**, not a string: a string must first be pinned to an encoding via `TextEncoder`, otherwise the same text could enter the digest
under different encodings at different call sites.

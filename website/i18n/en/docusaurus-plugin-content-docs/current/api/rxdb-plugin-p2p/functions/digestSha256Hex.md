# digestSha256Hex()

```ts
function digestSha256Hex(bytes): Promise<string>;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L73)

Computes the SHA-256 of a byte span and returns 64 lowercase hex characters.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

## Returns

`Promise`&lt;`string`&gt;

## Remarks

Uses the platform's native digest when WebCrypto is available; pages opened over http on a LAN are not secure contexts and have no `crypto.subtle`,
in which case `@aiao/rxdb`'s synchronous implementation is used — both produce bit-identical results.

# encodeP2PFrame()

```ts
function encodeP2PFrame(frame): Uint8Array;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L124)

Encodes a frame: 4-byte unsigned big-endian metadata length + JSON metadata + payload; error text is truncated to the protocol limit.

## Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `frame`   | [`P2PFrame`](../type-aliases/P2PFrame.md) |

## Returns

`Uint8Array`

## Throws

RangeError The payload exceeds 1 MiB, or the metadata exceeds 8 KiB

# decodeP2PFrame()

```ts
function decodeP2PFrame(bytes): P2PFrame | null;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L203)

Decodes and strictly validates a frame.

## Parameters

| Parameter | Type         |
| --------- | ------------ |
| `bytes`   | `Uint8Array` |

## Returns

[`P2PFrame`](../type-aliases/P2PFrame.md) \| `null`

The decoded frame; returns `null` when the frame type in the metadata is unknown — that is a frame from a newer-version peer, and the caller should ignore it rather than disconnect

## Throws

RangeError The frame header or metadata is truncated or over the limit, the payload length does not match the metadata, or a field of a known type is invalid

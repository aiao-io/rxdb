# createWebRTCTransport()

```ts
function createWebRTCTransport(channel, options?): P2PByteTransport;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L114)

Browser WebRTC DataChannel adapter; DataChannel provides DTLS encryption on its own.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | [`P2PDataChannelLike`](../interfaces/P2PDataChannelLike.md) |
| `options?` | [`P2PWebRTCTransportOptions`](../interfaces/P2PWebRTCTransportOptions.md) |

## Returns

[`P2PByteTransport`](../interfaces/P2PByteTransport.md)

## Remarks

Frames are fragmented at the message limit: the first byte of each message is 0 when more fragments follow and 1 for the final fragment, so large chunks are not constrained by the SCTP message limit.
Sending is serialized; while the channel is still establishing it waits for `open`, and when the send buffer exceeds 1 MiB it waits for `bufferedamountlow`.
Any failure (error event, close, non-binary message, illegal fragmentation) closes the channel and removes the listeners; the first failure reason is kept to the end.

## Throws

RangeError `maxMessageSize` is smaller than 1024 bytes or not an integer

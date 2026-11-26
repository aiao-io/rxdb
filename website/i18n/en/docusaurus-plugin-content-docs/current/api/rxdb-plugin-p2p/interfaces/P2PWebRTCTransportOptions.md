# P2PWebRTCTransportOptions

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L31)

WebRTC adapter options.

## Properties

### maxMessageSize? \{#maxmessagesize\}

```ts
readonly maxMessageSize?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L36)

Byte limit of a single message (including the 1-byte fragment header), default 65536, the SCTP floor when un-negotiated; must not be smaller than 1024.
Can be set to `RTCPeerConnection.sctp.maxMessageSize`.

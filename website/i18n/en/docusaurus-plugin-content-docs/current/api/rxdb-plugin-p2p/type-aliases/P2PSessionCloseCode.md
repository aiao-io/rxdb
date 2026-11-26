# P2PSessionCloseCode

```ts
type P2PSessionCloseCode = 
  | "closed"
  | "peer_closed"
  | "peer_lost"
  | "unauthorized"
  | "incompatible"
  | "protocol_violation"
  | "duplicate"
  | "transport_failed";
```

Defined in: [packages/rxdb-plugin-p2p/src/session/errors.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/errors.ts#L18)

The reason a session ended.

- `closed`: closed locally
- `peer_closed`: the peer sent bye; see [P2PSessionClosedError.peerReason](../classes/P2PSessionClosedError.md#peerreason) for the reason
- `peer_lost`: hello or heartbeat timed out
- `unauthorized`: the peer's credential failed authentication
- `incompatible`: session protocol versions differ
- `protocol_violation`: the peer violated the protocol (malformed frame, limit exceeded, out-of-order hello, duplicate request number)
- `duplicate`: a session with the same peer already exists; this one was closed during deduplication
- `transport_failed`: the underlying transport failed to send or receive

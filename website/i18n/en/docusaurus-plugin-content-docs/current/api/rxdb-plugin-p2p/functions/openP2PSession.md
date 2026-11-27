# openP2PSession()

```ts
function openP2PSession(options): P2PPeerSession;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:749](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L749)

Opens a session on an established byte channel: both sides exchange hello and authenticate the peer first, then multiple protocols multiplex over the same channel.

## Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `options` | [`P2PSessionOptions`](../interfaces/P2PSessionOptions.md) |

## Returns

[`P2PPeerSession`](../interfaces/P2PPeerSession.md)

## Remarks

A device pair needs only one session: requests of any protocol are dispatched by protocol name, inbound requests of the same protocol are concurrency-limited by `maxConcurrentRequests`,
and more than 32 unfinished requests across the whole session (including requests for un-negotiated protocols that only need an error reply) is treated as a peer protocol violation.
Control frames (hello, heartbeat, cancel, payload-less replies) are sent before bulk frames with payloads, so large file transfers never starve small messages;
at most one ping and one pong is queued at a time, so a peer's ping flood cannot bloat the send queue.

When the peer's credential fails authentication, or cannot be verified within the handshake deadline, only the generic `unauthorized` is sent back, leaking nothing held locally;
unknown frame types are ignored, so peers on newer versions do not disconnect because of them; malformed frames, limit violations and out-of-order hello end the session immediately.
Heartbeat timeout ends the session with `peer_lost`, instead of only discovering a lost peer when the next request fails.

## Throws

RangeError An option is out of range, a protocol name is duplicated or invalid, the local instance identifier is invalid, or the credential makes hello exceed the metadata limit

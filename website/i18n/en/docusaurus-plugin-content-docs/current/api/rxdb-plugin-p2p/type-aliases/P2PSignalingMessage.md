# P2PSignalingMessage

```ts
type P2PSignalingMessage =
  | {
      connectionId: string;
      payload: unknown;
      type: 'offer' | 'answer' | 'ice';
    }
  | {
      connectionId: string;
      reason: 'unauthorized' | 'expired';
      type: 'reject';
    };
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L15)

A message relayed through the server's dedicated signaling route.

## Union Members

### Type Literal

```ts
{
  connectionId: string;
  payload: unknown;
  type: 'offer' | 'answer' | 'ice';
}
```

#### connectionId

```ts
readonly connectionId: string;
```

The identifier of this connection.

#### payload

```ts
readonly payload: unknown;
```

WebRTC negotiation payload, relayed as-is.

#### type

```ts
readonly type: "offer" | "answer" | "ice";
```

SDP offer / answer or an ICE candidate.

---

### Type Literal

```ts
{
  connectionId: string;
  reason: 'unauthorized' | 'expired';
  type: 'reject';
}
```

#### connectionId

```ts
readonly connectionId: string;
```

The identifier of the rejected connection.

#### reason

```ts
readonly reason: "unauthorized" | "expired";
```

Generic rejection reason, leaking no manifest details.

The connection only recognizes identity; whether the peer holds some content is answered per request after the session is established (the files protocol's `not_holder`).

#### type

```ts
readonly type: "reject";
```

Refuses to establish the connection.

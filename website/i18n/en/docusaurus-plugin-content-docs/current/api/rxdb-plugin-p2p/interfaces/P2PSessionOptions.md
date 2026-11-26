# P2PSessionOptions

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L77)

Options for opening a session.

## Properties

### authenticate \{#authenticate\}

```ts
readonly authenticate: (credential, context) =>
  | P2PPrincipal
  | Promise<P2PPrincipal | null>
  | null;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L89)

Verifies the peer's credential and returns the user and device verified by the auth host; returning null or throwing rejects the session, and must settle within `helloTimeoutMs`.

#### Parameters

| Parameter              | Type                            |
| ---------------------- | ------------------------------- |
| `credential`           | `string`                        |
| `context`              | \{ `connectionId`: `string`; \} |
| `context.connectionId` | `string`                        |

#### Returns

\| [`P2PPrincipal`](P2PPrincipal.md)
\| `Promise`&lt;[`P2PPrincipal`](P2PPrincipal.md) \| `null`&gt;
\| `null`

---

### connectionId \{#connectionid\}

```ts
readonly connectionId: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L83)

The connection identifier assigned by the signaling layer; the peer's credential must be bound to it, so a captured credential replayed on another connection is invalid.

---

### credential \{#credential\}

```ts
readonly credential: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L87)

The identity credential sent to the peer, issued by the auth host and bound to the `connectionId`.

---

### heartbeatIntervalMs? \{#heartbeatintervalms\}

```ts
readonly heartbeatIntervalMs?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L101)

Heartbeat interval (milliseconds), default 5000; pings are also sent during the handshake, so the peer does not declare the local side lost while local credential verification is slow.

---

### heartbeatTimeoutMs? \{#heartbeattimeoutms\}

```ts
readonly heartbeatTimeoutMs?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L107)

How long after readiness without any frame from the peer declares it lost (milliseconds), default 15000, must be larger than the heartbeat interval.
Rounded up to N periods at the heartbeat interval: from readiness, N consecutive complete periods without any frame trigger the verdict —
after the peer stops sending, the session ends between N and N + 1 intervals.

---

### helloTimeoutMs? \{#hellotimeoutms\}

```ts
readonly helloTimeoutMs?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L99)

Handshake deadline (milliseconds), default 10000: from opening the session to receiving the peer's hello and finishing verifying its credential.
Ends with `peer_lost` when no hello arrives; ends with `unauthorized` when hello arrived but `authenticate` did not settle within the deadline.

---

### local \{#local\}

```ts
readonly local: P2PPeerIdentity;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L85)

The local identity.

---

### protocols \{#protocols\}

```ts
readonly protocols: readonly P2PProtocol[];
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L94)

The protocols supported by the local side; protocol names must not be duplicated.

---

### role \{#role\}

```ts
readonly role: P2PSessionRole;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L81)

The local side's role.

---

### transport \{#transport\}

```ts
readonly transport: P2PByteTransport;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L79)

The established byte channel; the session exclusively owns its receive side.

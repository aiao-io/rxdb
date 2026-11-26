# P2PInboundRequest

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L45)

An inbound request passed to a protocol handler.

## Properties

### method \{#method\}

```ts
readonly method: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L47)

The method name within the protocol.

---

### params \{#params\}

```ts
readonly params: P2PJsonValue;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L49)

JSON parameters.

---

### payload \{#payload\}

```ts
readonly payload: Uint8Array;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L51)

Binary payload.

---

### peer \{#peer\}

```ts
readonly peer: P2PPeerIdentity;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L53)

The authenticated peer identity.

---

### signal \{#signal\}

```ts
readonly signal: AbortSignal;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L55)

Aborts when the peer cancels this request or when the session ends.

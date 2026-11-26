# P2PPeerSession

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L111)

A session between two devices.

## Properties

### closed \{#closed\}

```ts
readonly closed: Promise<P2PSessionClosedError>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L121)

Fulfills with the end reason when the session ends; never rejects.

---

### connectionId \{#connectionid\}

```ts
readonly connectionId: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L115)

The connection identifier assigned by the signaling layer.

---

### local \{#local\}

```ts
readonly local: P2PPeerIdentity;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L117)

The local identity.

---

### peer \{#peer\}

```ts
readonly peer: P2PPeerIdentity | undefined;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L123)

The authenticated peer identity; undefined before the session is ready.

---

### ready \{#ready\}

```ts
readonly ready: Promise<P2PPeerIdentity>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L119)

Fulfills with the peer identity after both sides exchange hello and the peer passes authentication; rejects with the end reason if the session ends before that.

---

### role \{#role\}

```ts
readonly role: P2PSessionRole;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L113)

The local side's role.

---

### state \{#state\}

```ts
readonly state: P2PSessionState;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L125)

Session state.

## Methods

### close() \{#close\}

```ts
close(reason?): Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L141)

Ends the session: notifies the peer and then closes the underlying transport; safe to call repeatedly.

#### Parameters

| Parameter | Type                        | Description                                                                |
| --------- | --------------------------- | -------------------------------------------------------------------------- |
| `reason?` | `"closed"` \| `"duplicate"` | The reason told to the peer: `closed`, or `duplicate` during deduplication |

#### Returns

`Promise`&lt;`void`&gt;

---

### request() \{#request\}

```ts
request(
   protocol,
   call,
   signal?
): Promise<P2PReply>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L135)

Sends a request to the peer; waits for readiness before sending, and queues when the local side has more than 32 unfinished requests.

#### Parameters

| Parameter  | Type                    | Description                                                                                              |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `protocol` | `string`                | -                                                                                                        |
| `call`     | [`P2PCall`](P2PCall.md) | -                                                                                                        |
| `signal?`  | `AbortSignal`           | Cancels this request: the local side stops waiting immediately and notifies the peer to abort processing |

#### Returns

`Promise`&lt;[`P2PReply`](P2PReply.md)&gt;

#### Throws

P2PRequestError The peer rejected the request, or the protocol is not negotiated (`unsupported`)

#### Throws

P2PSessionClosedError The session has ended

---

### supports() \{#supports\}

```ts
supports(protocol): boolean;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L127)

Whether the peer supports a protocol: both ends declared it with the same version. Always false before readiness.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `protocol` | `string` |

#### Returns

`boolean`

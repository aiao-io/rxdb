# P2PSessionRegistry

Defined in: [packages/rxdb-plugin-p2p/src/session/registry.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/registry.ts#L28)

Registry of ready sessions: only one session per peer (user + device + instance).

## Remarks

The losing session is closed with `duplicate` and the peer is informed; a session is removed from the registry automatically when it ends (for any reason).

## Constructors

### Constructor

```ts
new P2PSessionRegistry(): P2PSessionRegistry;
```

#### Returns

`P2PSessionRegistry`

## Properties

### sessions$ \{#sessions\}

```ts
readonly sessions$: Observable<readonly P2PPeerSession[]>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/registry.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/registry.ts#L32)

The current session list: emits the current value on subscription, then one emission per addition or removal.

## Accessors

### sessions \{#sessions-1\}

#### Get Signature

```ts
get sessions(): readonly P2PPeerSession[];
```

Defined in: [packages/rxdb-plugin-p2p/src/session/registry.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/registry.ts#L35)

Snapshot of the current session list.

##### Returns

readonly [`P2PPeerSession`](../interfaces/P2PPeerSession.md)[]

## Methods

### add() \{#add\}

```ts
add(session): Promise<P2PPeerSession>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/registry.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/registry.ts#L45)

Registers a session: waits until it is ready, then deduplicates by peer identity.

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `session` | [`P2PPeerSession`](../interfaces/P2PPeerSession.md) |

#### Returns

`Promise`&lt;[`P2PPeerSession`](../interfaces/P2PPeerSession.md)&gt;

The session the registry keeps for that peer: either the one passed in, or the existing one

#### Throws

P2PSessionClosedError The session ended before becoming ready

---

### close() \{#close\}

```ts
close(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/registry.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/registry.ts#L67)

Closes all registered sessions.

#### Returns

`Promise`&lt;`void`&gt;

---

### get() \{#get\}

```ts
get(peer): P2PPeerSession | undefined;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/registry.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/registry.ts#L62)

The session currently registered for a peer.

#### Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `peer`    | [`P2PPeerIdentity`](../interfaces/P2PPeerIdentity.md) |

#### Returns

[`P2PPeerSession`](../interfaces/P2PPeerSession.md) \| `undefined`

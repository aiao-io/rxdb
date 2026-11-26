# P2PSignalingChannel

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L5)

Server signaling only relays authenticated SDP/ICE and never participates in byte transfer.

## Properties

### close? \{#close\}

```ts
readonly close?: () => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L11)

Closes the signaling channel.

#### Returns

`void` \| `Promise`&lt;`void`&gt;

---

### receive \{#receive\}

```ts
readonly receive: (signal?) => Promise<P2PSignalingMessage>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L9)

Receives the next signaling message.

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `signal?` | `AbortSignal` |

#### Returns

`Promise`&lt;[`P2PSignalingMessage`](../type-aliases/P2PSignalingMessage.md)&gt;

---

### send \{#send\}

```ts
readonly send: (message) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L7)

Sends a signaling message.

#### Parameters

| Parameter | Type                                                            |
| --------- | --------------------------------------------------------------- |
| `message` | [`P2PSignalingMessage`](../type-aliases/P2PSignalingMessage.md) |

#### Returns

`Promise`&lt;`void`&gt;

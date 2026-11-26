# P2PByteTransport

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L5)

A bidirectional byte channel carrying encoded frames.

## Properties

### close \{#close\}

```ts
readonly close: () => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L11)

Closes the channel and releases the underlying connection; safe to call repeatedly.

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### receive \{#receive\}

```ts
readonly receive: (signal?) => Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L9)

Receives the next frame; rejects after the channel fails or closes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `signal?` | `AbortSignal` |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

***

### send \{#send\}

```ts
readonly send: (frame) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L7)

Sends a frame; when the underlying buffer is full, completes once writing is possible again.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `frame` | `Uint8Array` |

#### Returns

`Promise`&lt;`void`&gt;

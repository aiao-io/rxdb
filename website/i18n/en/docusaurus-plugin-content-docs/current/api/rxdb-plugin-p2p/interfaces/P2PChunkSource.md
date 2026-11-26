# P2PChunkSource

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L20)

The minimal channel for requesting file chunks from an authenticated peer.

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L22)

Peer identifier, used to isolate bad peers and report `sourcesUsed`.

---

### requestChunk \{#requestchunk\}

```ts
readonly requestChunk: (request, signal) => Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L24)

Requests a byte range; `signal` aborts on timeout, cancellation or transfer failure.

#### Parameters

| Parameter | Type                                    |
| --------- | --------------------------------------- |
| `request` | [`P2PChunkRequest`](P2PChunkRequest.md) |
| `signal`  | `AbortSignal`                           |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

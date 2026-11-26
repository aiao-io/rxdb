# P2PTransferOptions

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L28)

Transfer write-to-disk and progress callbacks.

## Properties

### completedChunks? \{#completedchunks\}

```ts
readonly completedChunks?: Iterable<number, any, any>;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L42)

Chunks completed in a previous attempt; requires `readChunk` to be provided, and chunks that cannot be read back or fail verification are re-fetched.

***

### concurrency? \{#concurrency\}

```ts
readonly concurrency?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L44)

Number of chunk requests in flight at once, 1-8; defaults to the larger of 2 and the number of holding peers.

***

### manifest \{#manifest\}

```ts
readonly manifest: P2PFileManifest;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L30)

The manifest the requester trusts: chunking and verification both follow it.

***

### maxAttemptsPerChunk? \{#maxattemptsperchunk\}

```ts
readonly maxAttemptsPerChunk?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L46)

Maximum attempts for a single chunk; defaults to twice the peer count, at least 2.

***

### maxPeerFailures? \{#maxpeerfailures\}

```ts
readonly maxPeerFailures?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L48)

How many consecutive failures quarantine a peer, default 3; delivering one valid chunk resets the count.

***

### onProgress? \{#onprogress\}

```ts
readonly onProgress?: (progress) => void;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L54)

Called once per chunk written to disk; an error thrown by the callback aborts the transfer.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `progress` | [`P2PTransferProgress`](P2PTransferProgress.md) |

#### Returns

`void`

***

### readChunk? \{#readchunk\}

```ts
readonly readChunk?: (index) => Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L40)

Reads back an on-disk chunk: verifies completed chunks before resuming, and after completion re-verifies the on-disk result chunk by chunk and checks the whole-file hash.

When omitted, writes stream in chunk order and the receiver buffers at most 8 chunks.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `index` | `number` |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

***

### requestTimeoutMs? \{#requesttimeoutms\}

```ts
readonly requestTimeoutMs?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L50)

Timeout of a single chunk request (milliseconds), 1-2147483647, default 30000; a source that ignores the cancellation signal is still given up on time.

***

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L52)

Cancels the whole transfer; the reason is passed through as-is to the caller.

***

### sources \{#sources\}

```ts
readonly sources: readonly P2PChunkSource[];
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L32)

Authenticated holding peers; chunks are assigned by load, and peers with consecutive failures are quarantined.

***

### writeChunk \{#writechunk\}

```ts
readonly writeChunk: (index, bytes) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L34)

Writes a verified chunk to disk; a write failure is treated as a storage failure and is not retryable.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `index` | `number` |
| `bytes` | `Uint8Array` |

#### Returns

`Promise`&lt;`void`&gt;

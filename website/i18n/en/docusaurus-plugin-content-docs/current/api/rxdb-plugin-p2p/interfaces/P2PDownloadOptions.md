# P2PDownloadOptions

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L23)

Inputs for P2P routing. The server is only invoked when no peer is available or P2P failed retryably.

## Properties

### completedChunks? \{#completedchunks\}

```ts
readonly completedChunks?: Iterable<number, any, any>;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L39)

Chunks completed in a previous attempt; requires `readChunk` to be provided.

***

### concurrency? \{#concurrency\}

```ts
readonly concurrency?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L43)

Number of chunk requests in flight at once, 1-8.

***

### fallback? \{#fallback\}

```ts
readonly fallback?: P2PServerFallback;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L29)

Server fallback downloader; when not configured, P2P failures are errors directly.

***

### manifest \{#manifest\}

```ts
readonly manifest: P2PFileManifest;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L25)

The manifest the requester trusts.

***

### onProgress? \{#onprogress\}

```ts
readonly onProgress?: (progress) => void;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L45)

Local progress events; `route` indicates whether P2P or the server is currently used.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `progress` | \{ `bytesTransferred`: `number`; `completedChunks`: `number`; `route`: `"p2p"` \| `"server"`; `totalBytes`: `number`; `totalChunks`: `number`; \} |
| `progress.bytesTransferred` | `number` |
| `progress.completedChunks` | `number` |
| `progress.route` | `"p2p"` \| `"server"` |
| `progress.totalBytes` | `number` |
| `progress.totalChunks` | `number` |

#### Returns

`void`

***

### readChunk? \{#readchunk\}

```ts
readonly readChunk?: (index) => Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L37)

Reads back an on-disk chunk: skips verified chunks when resuming or falling back, and re-verifies the on-disk result.

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

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L41)

Timeout of a single chunk request (milliseconds).

***

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L33)

Cancels the whole download.

***

### sources \{#sources\}

```ts
readonly sources: readonly P2PChunkSource[];
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L27)

Authenticated holding peers; when empty, the server is used directly.

***

### token? \{#token\}

```ts
readonly token?: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L31)

The auth credential used for the server download.

***

### writeChunk \{#writechunk\}

```ts
readonly writeChunk: (index, bytes) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L35)

Writes a verified chunk to disk.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `index` | `number` |
| `bytes` | `Uint8Array` |

#### Returns

`Promise`&lt;`void`&gt;

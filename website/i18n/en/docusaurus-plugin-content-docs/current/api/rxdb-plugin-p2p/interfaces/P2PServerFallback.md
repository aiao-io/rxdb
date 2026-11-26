# P2PServerFallback

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L7)

Server fallback downloader; the implementation is responsible for reusing the existing HTTP adapter's auth configuration.

## Properties

### download \{#download\}

```ts
readonly download: (options) => Promise<ReadableStream<Uint8Array<ArrayBufferLike>>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L15)

Opens the byte stream of the whole file, for example the `body` of a `fetch()` response.

#### Parameters

| Parameter          | Type                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `options`          | \{ `manifest`: [`P2PFileManifest`](P2PFileManifest.md); `signal?`: `AbortSignal`; `token?`: `string`; \} |
| `options.manifest` | [`P2PFileManifest`](P2PFileManifest.md)                                                                  |
| `options.signal?`  | `AbortSignal`                                                                                            |
| `options.token?`   | `string`                                                                                                 |

#### Returns

`Promise`&lt;`ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;&gt;

#### Remarks

Bytes are chunked according to the manifest and written to disk only after each chunk passes verification; while reading the stream only the bytes needed to fill the current chunk are buffered, and the whole file never enters memory;
on download failure or cancellation the stream is cancelled to release the underlying connection.

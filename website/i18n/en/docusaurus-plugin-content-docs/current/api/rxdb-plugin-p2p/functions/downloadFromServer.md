# downloadFromServer()

```ts
function downloadFromServer(options): Promise<P2PTransferResult>;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L157)

Verifies the server response stream chunk-by-chunk against the manifest and writes to disk: bad chunks are not written, a response length mismatch is an error, and the whole file never enters memory.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `fallback`: [`P2PServerFallback`](../interfaces/P2PServerFallback.md); `manifest`: [`P2PFileManifest`](../interfaces/P2PFileManifest.md); `onProgress?`: (`progress`) => `void`; `readChunk?`: (`index`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;; `signal?`: `AbortSignal`; `token?`: `string`; `writeChunk`: (`index`, `bytes`) => `Promise`&lt;`void`&gt;; \} |
| `options.fallback` | [`P2PServerFallback`](../interfaces/P2PServerFallback.md) |
| `options.manifest` | [`P2PFileManifest`](../interfaces/P2PFileManifest.md) |
| `options.onProgress?` | (`progress`) => `void` |
| `options.readChunk?` | (`index`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |
| `options.signal?` | `AbortSignal` |
| `options.token?` | `string` |
| `options.writeChunk` | (`index`, `bytes`) => `Promise`&lt;`void`&gt; |

## Returns

`Promise`&lt;[`P2PTransferResult`](../interfaces/P2PTransferResult.md)&gt;

## Remarks

Verified chunks are written as they are read; when a later chunk fails, the chunks already written remain for resumption. When `readChunk` is provided, chunks already verified and on disk
(for example chunks written before a mid-transfer P2P failure) are not rewritten, and newly written chunks are read back one by one for verification. A mismatch between the on-disk result and the manifest,
or per-chunk hashes all matching while the whole-file hash does not (a self-contradictory manifest), throws a non-retryable [P2PTransferError](../classes/P2PTransferError.md).
On failure or cancellation the response stream is cancelled; the cancellation reason is rethrown as-is to the caller.

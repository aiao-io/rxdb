# createChunkRequestHandler()

```ts
function createChunkRequestHandler(manifest, readRange): (request, signal?) => Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:497](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L497)

Builds a chunk request handler that serves only this manifest's content.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `manifest` | [`P2PFileManifest`](../interfaces/P2PFileManifest.md) |
| `readRange` | (`offset`, `size`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |

## Returns

(`request`, `signal?`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

## Remarks

Requests fetch by byte range, so the holder need not use the same chunk size as the requester; byte correctness is verified by the requester against its own manifest.

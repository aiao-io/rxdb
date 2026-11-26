# describeChunks()

```ts
function describeChunks(manifest): P2PChunkDescriptor[];
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L108)

Enumerates all chunks in the manifest.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `manifest` | `Pick`&lt;[`P2PFileManifest`](../interfaces/P2PFileManifest.md), `"size"` \| `"chunkSize"` \| `"chunkHashes"`&gt; |

## Returns

[`P2PChunkDescriptor`](../interfaces/P2PChunkDescriptor.md)[]

## Throws

RangeError The manifest's chunk count does not match the file size

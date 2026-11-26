# describeChunk()

```ts
function describeChunk(manifest, index): P2PChunkDescriptor;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L86)

Returns the description of one chunk according to the manifest.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `manifest` | `Pick`&lt;[`P2PFileManifest`](../interfaces/P2PFileManifest.md), `"size"` \| `"chunkSize"` \| `"chunkHashes"`&gt; |
| `index` | `number` |

## Returns

[`P2PChunkDescriptor`](../interfaces/P2PChunkDescriptor.md)

## Throws

RangeError The manifest's chunk count does not match the file size (same rule as [describeChunks](describeChunks.md)), or the chunk index is out of range

# createP2PFileManifest()

```ts
function createP2PFileManifest(options): Promise<P2PFileManifest>;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L131)

Builds an immutable manifest from a randomly-readable byte source.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `chunkSize?`: `number`; `fileName`: `string`; `holderId?`: `string`; `readChunk`: (`offset`, `size`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;; `size`: `number`; `sourceUrl?`: `string`; `updatedAt?`: `number`; \} |
| `options.chunkSize?` | `number` |
| `options.fileName` | `string` |
| `options.holderId?` | `string` |
| `options.readChunk` | (`offset`, `size`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |
| `options.size` | `number` |
| `options.sourceUrl?` | `string` |
| `options.updatedAt?` | `number` |

## Returns

`Promise`&lt;[`P2PFileManifest`](../interfaces/P2PFileManifest.md)&gt;

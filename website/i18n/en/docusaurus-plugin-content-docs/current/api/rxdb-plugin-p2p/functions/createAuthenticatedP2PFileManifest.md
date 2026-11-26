# createAuthenticatedP2PFileManifest()

```ts
function createAuthenticatedP2PFileManifest(options): Promise<P2PManifestRecord>;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L125)

Creates a file manifest with a holder record from an already-authenticated principal.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `chunkSize?`: `number`; `fileName`: `string`; `principal`: [`P2PPrincipal`](../interfaces/P2PPrincipal.md); `readChunk`: (`offset`, `size`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;; `size`: `number`; `sourceUrl?`: `string`; `updatedAt?`: `number`; \} |
| `options.chunkSize?` | `number` |
| `options.fileName` | `string` |
| `options.principal` | [`P2PPrincipal`](../interfaces/P2PPrincipal.md) |
| `options.readChunk` | (`offset`, `size`) => `Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |
| `options.size` | `number` |
| `options.sourceUrl?` | `string` |
| `options.updatedAt?` | `number` |

## Returns

`Promise`&lt;[`P2PManifestRecord`](../interfaces/P2PManifestRecord.md)&gt;

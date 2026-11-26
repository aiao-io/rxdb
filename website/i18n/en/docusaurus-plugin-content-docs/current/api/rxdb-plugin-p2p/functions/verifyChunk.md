# verifyChunk()

```ts
function verifyChunk(bytes, descriptor): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L116)

Verifies the length and hash of a chunk.

## Parameters

| Parameter    | Type                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `bytes`      | `Uint8Array`                                                                                    |
| `descriptor` | `Pick`&lt;[`P2PChunkDescriptor`](../interfaces/P2PChunkDescriptor.md), `"size"` \| `"hash"`&gt; |

## Returns

`Promise`&lt;`boolean`&gt;

# P2PLocalContent

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L17)

A file held by the local side.

## Properties

### manifest \{#manifest\}

```ts
readonly manifest: P2PFileManifest;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L19)

The local manifest; the chunk size may differ from the requester's, and fetching uses the requester's byte ranges.

***

### readRange \{#readrange\}

```ts
readonly readRange: (offset, size) => Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L21)

Reads a byte range of the local file.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `offset` | `number` |
| `size` | `number` |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

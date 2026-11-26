# P2PChunkDescriptor

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L27)

The byte range of a single file chunk.

## Properties

### hash \{#hash\}

```ts
readonly hash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L35)

SHA-256 of the chunk (lowercase hex).

***

### index \{#index\}

```ts
readonly index: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L29)

Chunk index, starting from 0.

***

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L31)

The chunk's starting byte within the file.

***

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L33)

The chunk size in bytes.

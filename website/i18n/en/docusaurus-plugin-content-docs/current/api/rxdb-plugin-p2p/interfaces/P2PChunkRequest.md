# P2PChunkRequest

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L10)

A chunk request: fetch by the byte range in the requester's manifest; the holder need not use the same chunk size as the requester.

## Extended by

- [`P2PFilesAuthorizeContext`](P2PFilesAuthorizeContext.md)

## Properties

### contentHash \{#contenthash\}

```ts
readonly contentHash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L12)

The requested content hash.

---

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L14)

The starting byte of the range within the file.

---

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L16)

The range size in bytes.

# P2PFilesAuthorizeContext

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L30)

Context for per-request authorization.

## Extends

- [`P2PChunkRequest`](P2PChunkRequest.md)

## Properties

### contentHash \{#contenthash\}

```ts
readonly contentHash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L12)

The requested content hash.

#### Inherited from

[`P2PChunkRequest`](P2PChunkRequest.md).[`contentHash`](P2PChunkRequest.md#contenthash)

---

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L14)

The starting byte of the range within the file.

#### Inherited from

[`P2PChunkRequest`](P2PChunkRequest.md).[`offset`](P2PChunkRequest.md#offset)

---

### peer \{#peer\}

```ts
readonly peer: P2PPeerIdentity;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L32)

The authenticated peer identity.

---

### signal \{#signal\}

```ts
readonly signal: AbortSignal;
```

Defined in: [packages/rxdb-plugin-p2p/src/files-protocol.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/files-protocol.ts#L34)

Aborts when the peer cancels this request or when the session ends.

---

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L16)

The range size in bytes.

#### Inherited from

[`P2PChunkRequest`](P2PChunkRequest.md).[`size`](P2PChunkRequest.md#size)

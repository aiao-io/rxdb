# P2PTransferResult

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L70)

Summary after a transfer completes.

## Properties

### bytesTransferred \{#bytestransferred\}

```ts
readonly bytesTransferred: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L76)

Bytes written to disk (including the part completed before resumption).

---

### completedChunks \{#completedchunks\}

```ts
readonly completedChunks: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L74)

Chunks written to disk and verified.

---

### contentHash \{#contenthash\}

```ts
readonly contentHash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L72)

The verified content hash.

---

### sourcesUsed \{#sourcesused\}

```ts
readonly sourcesUsed: readonly string[];
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L78)

The sources that actually delivered valid chunks, ordered by first delivery.

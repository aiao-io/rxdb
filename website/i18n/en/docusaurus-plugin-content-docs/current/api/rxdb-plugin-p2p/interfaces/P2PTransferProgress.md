# P2PTransferProgress

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L58)

A local progress event; never written into a synced entity.

## Properties

### bytesTransferred \{#bytestransferred\}

```ts
readonly bytesTransferred: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L64)

Bytes written to disk.

---

### completedChunks \{#completedchunks\}

```ts
readonly completedChunks: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L60)

Chunks written to disk.

---

### totalBytes \{#totalbytes\}

```ts
readonly totalBytes: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L66)

Total bytes of the file.

---

### totalChunks \{#totalchunks\}

```ts
readonly totalChunks: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L62)

Total chunks of the file.

# P2PFileManifest

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L7)

A file manifest; once a manifest is published, `chunkSize` and `chunkHashes` must never be rewritten.

## Extended by

- [`P2PManifestRecord`](P2PManifestRecord.md)

## Properties

### chunkHashes \{#chunkhashes\}

```ts
readonly chunkHashes: readonly string[];
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L17)

SHA-256 of each chunk (lowercase hex), in chunk order.

***

### chunkSize \{#chunksize\}

```ts
readonly chunkSize: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L15)

Fixed chunk size (the last chunk may be shorter); the chunking follows the requester's manifest.

***

### contentHash \{#contenthash\}

```ts
readonly contentHash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L9)

SHA-256 of the whole file (lowercase hex), the content-addressing primary key.

***

### fileName \{#filename\}

```ts
readonly fileName: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L11)

File name for display; not part of content verification.

***

### holderId? \{#holderid\}

```ts
readonly holderId?: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L21)

The holder is derived from the authenticated identity; the base chunking API may leave it unset for now, but it must exist when publishing a sync manifest.

***

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L13)

File size in bytes.

***

### sourceUrl? \{#sourceurl\}

```ts
readonly sourceUrl?: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L19)

Server fallback download URL.

***

### updatedAt? \{#updatedat\}

```ts
readonly updatedAt?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L23)

The moment the manifest's holder record was last updated.

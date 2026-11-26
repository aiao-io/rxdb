# P2PManifestRecord

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L15)

A holder record: a device verified by the auth host holds some content.

## Remarks

The record changes only when a file is acquired or explicitly deleted, and carries no expiry. Whether a device is online is answered by signaling presence, mDNS
or connection probing — never written into this synced record (US-704).

## Extends

- [`P2PFileManifest`](P2PFileManifest.md)

## Properties

### chunkHashes \{#chunkhashes\}

```ts
readonly chunkHashes: readonly string[];
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L17)

SHA-256 of each chunk (lowercase hex), in chunk order.

#### Inherited from

[`P2PFileManifest`](P2PFileManifest.md).[`chunkHashes`](P2PFileManifest.md#chunkhashes)

---

### chunkSize \{#chunksize\}

```ts
readonly chunkSize: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L15)

Fixed chunk size (the last chunk may be shorter); the chunking follows the requester's manifest.

#### Inherited from

[`P2PFileManifest`](P2PFileManifest.md).[`chunkSize`](P2PFileManifest.md#chunksize)

---

### contentHash \{#contenthash\}

```ts
readonly contentHash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L9)

SHA-256 of the whole file (lowercase hex), the content-addressing primary key.

#### Inherited from

[`P2PFileManifest`](P2PFileManifest.md).[`contentHash`](P2PFileManifest.md#contenthash)

---

### fileName \{#filename\}

```ts
readonly fileName: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L11)

File name for display; not part of content verification.

#### Inherited from

[`P2PFileManifest`](P2PFileManifest.md).[`fileName`](P2PFileManifest.md#filename)

---

### holderId \{#holderid\}

```ts
readonly holderId: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L19)

Holder ID derived from the authenticated principal and device.

#### Overrides

[`P2PFileManifest`](P2PFileManifest.md).[`holderId`](P2PFileManifest.md#holderid)

---

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L17)

Primary key derived from `contentHash` and `holderId`; writes are idempotent for the same device and content.

---

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L13)

File size in bytes.

#### Inherited from

[`P2PFileManifest`](P2PFileManifest.md).[`size`](P2PFileManifest.md#size)

---

### sourceUrl? \{#sourceurl\}

```ts
readonly sourceUrl?: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L19)

Server fallback download URL.

#### Inherited from

[`P2PFileManifest`](P2PFileManifest.md).[`sourceUrl`](P2PFileManifest.md#sourceurl)

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L21)

The holder's write moment (epoch milliseconds, holder's clock); only used to compare old vs. new for the same holder, never compared against the local clock.

#### Overrides

[`P2PFileManifest`](P2PFileManifest.md).[`updatedAt`](P2PFileManifest.md#updatedat)

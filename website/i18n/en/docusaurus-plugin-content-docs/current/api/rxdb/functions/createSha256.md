# createSha256()

```ts
function createSha256(): Sha256Hasher;
```

Defined in: [packages/rxdb/src/system/sha256.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sha256.ts#L176)

Creates an incremental SHA-256 hasher.

## Returns

[`Sha256Hasher`](../interfaces/Sha256Hasher.md)

A new hasher whose state is independent of other instances

## Remarks

The result is bit-for-bit identical to [sha256Hex](sha256Hex.md) over the same concatenated bytes; internally only the trailing block shorter than 64 bytes is buffered, so the resident memory is independent of the total input length.

# Sha256Hasher

Defined in: [packages/rxdb/src/system/sha256.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sha256.ts#L160)

Incremental SHA-256 digester.

## Remarks

The same function as [sha256Hex](../functions/sha256Hex.md), except that bytes can be fed in multiple chunks:
a backup archive (US-217) may be far larger than the memory budget, so the digest must be computed along the stream
rather than assembling the whole archive into one buffer first.

## Methods

### digestHex() \{#digesthex\}

```ts
digestHex(): string;
```

Defined in: [packages/rxdb/src/system/sha256.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sha256.ts#L164)

Finalizes the digest and returns the 64-character lowercase hex; calling any method afterwards throws.

#### Returns

`string`

---

### update() \{#update\}

```ts
update(bytes): void;
```

Defined in: [packages/rxdb/src/system/sha256.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sha256.ts#L162)

Appends a chunk of bytes; the argument is neither mutated nor retained.

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `bytes`   | `Uint8Array` |

#### Returns

`void`

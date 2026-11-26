# deserializeFromEnvelope

```ts
const deserializeFromEnvelope: (bytes, property) => unknown;
```

Defined in: packages/rxdb-adapter-encrypted/dist/serialize.d.ts:25

Restores authenticated plaintext bytes into a business value according to the property type used at persistence time.

`null` never enters this function; the adapter should return database NULL directly. Structured values, boolean, number, integer, bigint, and date are all validated strictly, so a corrupted payload cannot be silently rewritten into a legitimate business value. `binary` returns an independent copy.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `bytes`    | `Uint8Array`   |
| `property` | `PropertyLike` |

## Returns

`unknown`

## Throws

EncryptedDecryptError when the payload cannot be decoded as the declared persisted type

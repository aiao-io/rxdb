# deserializeFromEnvelope

```ts
const deserializeFromEnvelope: (bytes, property) => unknown;
```

Defined in: packages/rxdb-adapter-encrypted/dist/serialize.d.ts:25

Restores authenticated plaintext bytes into business values according to the property types at persistence time.

`null` does not enter this function; the adapter should return the database NULL directly. Structured values, boolean, number, integer,
bigint, and date are all strictly validated, to avoid silently rewriting a corrupt payload into a legitimate business value. `binary` returns an independent copy.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `bytes`    | `Uint8Array`   |
| `property` | `PropertyLike` |

## Returns

`unknown`

## Throws

EncryptedDecryptError when the payload cannot be decoded according to the declared persistence type

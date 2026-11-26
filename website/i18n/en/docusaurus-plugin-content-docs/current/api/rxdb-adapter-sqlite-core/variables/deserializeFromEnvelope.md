# deserializeFromEnvelope

```ts
const deserializeFromEnvelope: (bytes, property) => unknown;
```

Defined in: packages/rxdb-adapter-encrypted/dist/serialize.d.ts:25

Restores authenticated plaintext bytes to business values according to the property types at persistence time.

`null` never enters this function; the adapter should return the database NULL directly. Structured values, boolean, number, integer,
bigint and date are all strictly validated, to avoid silently rewriting a corrupted payload into a legal business value. `binary` returns an independent copy.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `bytes`    | `Uint8Array`   |
| `property` | `PropertyLike` |

## Returns

`unknown`

## Throws

EncryptedDecryptError The payload cannot be decoded as the declared persistence type

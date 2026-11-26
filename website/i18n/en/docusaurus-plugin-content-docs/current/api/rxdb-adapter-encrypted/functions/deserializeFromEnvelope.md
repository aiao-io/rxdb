# deserializeFromEnvelope()

```ts
function deserializeFromEnvelope(bytes, property): unknown;
```

Defined in: [packages/rxdb-adapter-encrypted/src/serialize.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/serialize.ts#L128)

Restores authenticated plaintext bytes back to business values by the property type at persistence time.

`null` does not enter this function; the adapter should return the database NULL directly. Structured values, boolean, number, integer,
bigint and date are all strictly validated, avoiding silently rewriting corrupted payloads into valid business values. `binary` returns an independent copy.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `bytes`    | `Uint8Array`   |
| `property` | `PropertyLike` |

## Returns

`unknown`

## Throws

[EncryptedDecryptError](../classes/EncryptedDecryptError.md) The payload cannot be decoded by the declared persisted type

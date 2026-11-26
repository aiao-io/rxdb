# serializeForEnvelope()

```ts
function serializeForEnvelope(value, property): Uint8Array;
```

Defined in: [packages/rxdb-adapter-encrypted/src/serialize.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/serialize.ts#L69)

Encodes a single non-null business value into envelope plaintext bytes by property type.

Persisting `null` / `undefined` is bypassed by the adapter and should not call this function. The write side is as strict as [deserializeFromEnvelope](deserializeFromEnvelope.md):
values the read side would reject are rejected right here — encrypted columns cannot enter queries, and rows that cannot be read back can be neither found nor cleaned up.
boolean only accepts `true` / `false` and the SQL forms `0` / `1`; number only accepts finite numbers, integer only safe integers;
date only accepts valid Dates, finite millisecond numbers or parseable date strings; `binary` copies the current `Uint8Array` view;
JSON, keyValue and arrays must be representable by `JSON.stringify`, and keyValue / arrays are validated against their shape after a JSON round-trip;
bigint is limited to signed 64-bit. Text types are encoded as-is, and a `Uint8Array` is treated as already-encoded plaintext and passed through directly.
Changing the `PropertyType` of the same column after persistence breaks the decoding contract; the data must be migrated first.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `value`    | `unknown`      |
| `property` | `PropertyLike` |

## Returns

`Uint8Array`

## Throws

TypeError Value does not match the property type or cannot be serialized

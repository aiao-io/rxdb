# serializeForEnvelope

```ts
const serializeForEnvelope: (value, property) => Uint8Array;
```

Defined in: packages/rxdb-adapter-encrypted/dist/serialize.d.ts:16

Encodes a single non-null business value into envelope plaintext bytes according to its property type.

Persistence of `null` / `undefined` is bypassed by the adapter; this function should not be called for them. The write side is as strict as [deserializeFromEnvelope](deserializeFromEnvelope.md):
values the read side would reject are rejected here — encrypted columns cannot enter queries, and rows that cannot be read back can be neither found nor cleaned up.
boolean only accepts `true` / `false` and the SQL forms `0` / `1`; number only accepts finite numbers, integer only safe integers;
date only accepts a valid Date, a finite millisecond count, or a parseable date string; `binary` copies the current `Uint8Array` view;
JSON, keyValue and arrays must be representable by `JSON.stringify`, and keyValue / arrays are validated by shape after a JSON round trip;
bigint is limited to signed 64-bit. Text types are encoded as-is; a `Uint8Array` is treated as already-encoded plaintext and passed through directly.
Changing the `PropertyType` of the same column after persistence breaks the decoding contract; the data must be migrated first.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |
| `property` | `PropertyLike` |

## Returns

`Uint8Array`

## Throws

TypeError The value does not match the property type or cannot be serialized

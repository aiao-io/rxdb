# serializeForEnvelope

```ts
const serializeForEnvelope: (value, property) => Uint8Array;
```

Defined in: packages/rxdb-adapter-encrypted/dist/serialize.d.ts:16

Encodes a single non-null business value into envelope plaintext bytes according to its property type.

Persistence of `null` / `undefined` is handled by the adapter as a bypass and should not call this function. The write side is as strict as
[deserializeFromEnvelope](deserializeFromEnvelope.md): values the read side would reject are rejected here — encrypted columns cannot enter queries, and a row that cannot be read back can neither be found nor cleared.
boolean only accepts `true` / `false` and the SQL forms `0` / `1`; number only accepts finite numbers, integer only safe integers;
date only accepts a valid Date, a finite millisecond number, or a parseable date string; `binary` copies the current `Uint8Array` view;
JSON, keyValue and arrays must be representable by `JSON.stringify`, and keyValue / arrays are validated by shape after a JSON round trip;
bigint is limited to signed 64-bit. Text types are encoded as-is, and a `Uint8Array` is treated as already-encoded plaintext and passed through directly.
Changing the `PropertyType` of the same column after landing in the database breaks the decode contract; data must be migrated first.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `value`    | `unknown`      |
| `property` | `PropertyLike` |

## Returns

`Uint8Array`

## Throws

TypeError when the value does not match the property type or cannot be serialized

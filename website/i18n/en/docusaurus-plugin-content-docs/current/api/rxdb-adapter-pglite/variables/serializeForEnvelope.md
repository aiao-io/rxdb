# serializeForEnvelope

```ts
const serializeForEnvelope: (value, property) => Uint8Array;
```

Defined in: packages/rxdb-adapter-encrypted/dist/serialize.d.ts:16

Encodes a single non-null business value into envelope plaintext bytes according to the property type.

Persisting `null` / `undefined` is bypassed by the adapter and should not call this function. The write side is as strict as [deserializeFromEnvelope](deserializeFromEnvelope.md): values the read side would reject are rejected here — encrypted columns cannot be queried, and rows that cannot be read back can neither be found nor cleaned up. boolean accepts only `true` / `false` and the SQL forms `0` / `1`; number accepts only finite numbers, integer only safe integers; date accepts only valid Date objects, finite millisecond counts, or parseable date strings; `binary` copies the current `Uint8Array` view; JSON, keyValue, and arrays must be representable by `JSON.stringify`, and keyValue / arrays are validated against their shape after a JSON round trip; bigint is limited to signed 64-bit. Text types are encoded as-is, and `Uint8Array` is treated as already-encoded plaintext and passed through. Changing the `PropertyType` of the same column after data has been persisted breaks the decoding contract; the data must be migrated first.

## Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `value`    | `unknown`      |
| `property` | `PropertyLike` |

## Returns

`Uint8Array`

## Throws

TypeError when the value does not match the property type or cannot be serialized

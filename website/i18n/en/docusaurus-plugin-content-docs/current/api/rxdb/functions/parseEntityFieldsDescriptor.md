# parseEntityFieldsDescriptor()

```ts
function parseEntityFieldsDescriptor(value): EntityFieldsDescriptor;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:983](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L983)

Parses and validates a fields descriptor coming from the network or storage.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | Any untrusted input |

## Returns

[`EntityFieldsDescriptor`](../interfaces/EntityFieldsDescriptor.md)

A freshly constructed descriptor object; unknown keys at any level never appear in the return value

## Throws

[RxDBError](../classes/RxDBError.md) on `dtoVersion` mismatch, missing known keys or wrong types,
non-JSON-safe values, or field combinations violating INV-4 / INV-5 / INV-6

## Remarks

Unknown keys are silently dropped, known keys are strictly validated (D6.1). Foreign config keys across formats fall into the former:
that is the registration-time `invalidFormatConfig`'s job — the parser only removes them.

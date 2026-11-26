# parseEntityFieldValue()

```ts
function parseEntityFieldValue(type, raw): unknown;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L95)

Normalizes a raw value into the entity-side runtime representation per field type.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | [`EntityFieldTypeName`](../type-aliases/EntityFieldTypeName.md) | The closed set [EntityFieldTypeName](../type-aliases/EntityFieldTypeName.md). Arbitrary strings are not accepted: unknown values always throw, so that config typos, generator version drift or unimplemented new enums are never disguised as "parsed successfully". |
| `raw` | `unknown` | The raw value; `null` and the empty string are uniformly normalized to `null` |

## Returns

`unknown`

## Throws

When `type` is not a member of [EntityFieldTypeName](../type-aliases/EntityFieldTypeName.md), with the type name in the error message

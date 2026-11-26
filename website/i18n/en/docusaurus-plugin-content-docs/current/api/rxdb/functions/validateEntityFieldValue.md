# ~~Function: validateEntityFieldValue()~~

```ts
function validateEntityFieldValue(field, value): FieldValidationError | null;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L252)

Validates a field value against [EntityFieldConfig](../interfaces/EntityFieldConfig.md).

## Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `field`   | [`EntityFieldConfig`](../interfaces/EntityFieldConfig.md) |
| `value`   | `unknown`                                                 |

## Returns

[`FieldValidationError`](../interfaces/FieldValidationError.md) \| `null`

## Deprecated

Use [validateFieldValue](validateFieldValue.md) instead — it takes an [EntityFieldDescriptor](../type-aliases/EntityFieldDescriptor.md),
supports `format` / `enum` semantics and returns `rule` plus the normalized `value`. This function's signature, behavior and output are frozen,
and it is kept together with [EntityFieldConfig](../interfaces/EntityFieldConfig.md) until the next major version.

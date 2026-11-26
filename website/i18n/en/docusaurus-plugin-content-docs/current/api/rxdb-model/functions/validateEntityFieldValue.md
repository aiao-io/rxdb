# validateEntityFieldValue()

```ts
function validateEntityFieldValue(
   field, 
   value, 
   i18n?
): FieldValidationError | null;
```

Defined in: [packages/rxdb-model/src/entity-value.utils.ts:361](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-value.utils.ts#L361)

Validates whether a single field value satisfies the field configuration constraints.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `field` | [`EntityFieldConfig`](../interfaces/EntityFieldConfig.md) | The field configuration |
| `value` | `unknown` | The field value to validate |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

[`FieldValidationError`](../interfaces/FieldValidationError.md) \| `null`

The validation error; returns null when validation passes.

## Remarks

Validates required, UUID format, number / integer / bigint / binary, date, enum range, JSON format
and format semantics (url / email / phone / color / range).

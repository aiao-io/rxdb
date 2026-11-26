# validateEntityFieldValue()

```ts
function validateEntityFieldValue(field, value, i18n?): FieldValidationError | null;
```

Defined in: packages/rxdb-model/dist/entity-value.utils.d.ts:58

Validates whether a single field value satisfies the field config constraints

## Parameters

| Parameter | Type                                                      | Description                 |
| --------- | --------------------------------------------------------- | --------------------------- |
| `field`   | [`EntityFieldConfig`](../interfaces/EntityFieldConfig.md) | Field config                |
| `value`   | `unknown`                                                 | The field value to validate |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md)                 | -                           |

## Returns

[`FieldValidationError`](../interfaces/FieldValidationError.md) \| `null`

The validation error; returns null when validation passes

## Remarks

Validates required-ness, UUID format, number / integer / bigint / binary, dates, enum ranges, JSON format
and format semantics (url / email / phone / color / range)

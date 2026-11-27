# validateField()

```ts
function validateField(field, value, i18n?): FieldValidationError | null;
```

Defined in: packages/rxdb-model/dist/entity-form/form-validation.d.ts:10

Validates a single form field value

## Parameters

| Parameter | Type                                                  | Description                 |
| --------- | ----------------------------------------------------- | --------------------------- |
| `field`   | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) | Form field config           |
| `value`   | `unknown`                                             | The field value to validate |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md)             | -                           |

## Returns

[`FieldValidationError`](../interfaces/FieldValidationError.md) \| `null`

The validation error; returns null when validation passes

# validateField()

```ts
function validateField(
   field, 
   value, 
   i18n?
): FieldValidationError | null;
```

Defined in: [packages/rxdb-model/src/entity-form/form-validation.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-validation.ts#L21)

Validates the value of a single form field.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `field` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md) | The form field configuration |
| `value` | `unknown` | The field value to validate |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

[`FieldValidationError`](../interfaces/FieldValidationError.md) \| `null`

The validation error; returns null when validation passes.

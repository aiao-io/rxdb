# validateForm()

```ts
function validateForm(
   fields, 
   data, 
   i18n?
): FormValidationResult;
```

Defined in: [packages/rxdb-model/src/entity-form/form-validation.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-validation.ts#L32)

Validates the whole form data

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field config |
| `data` | [`EntityFormData`](../interfaces/EntityFormData.md) | Form data |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)

The validation result (whether it passed and the error list)

## Remarks

Read-only and hidden fields do not take part in validation

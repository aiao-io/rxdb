# validateForm()

```ts
function validateForm(fields, data, i18n?): FormValidationResult;
```

Defined in: packages/rxdb-model/dist/entity-form/form-validation.d.ts:18

Validates the entire form data

## Parameters

| Parameter | Type                                                    | Description              |
| --------- | ------------------------------------------------------- | ------------------------ |
| `fields`  | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field configuration |
| `data`    | [`EntityFormData`](../interfaces/EntityFormData.md)     | Form data                |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md)               | -                        |

## Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)

The validation result (whether it passed and the list of errors)

## Remarks

Readonly and hidden fields do not participate in validation

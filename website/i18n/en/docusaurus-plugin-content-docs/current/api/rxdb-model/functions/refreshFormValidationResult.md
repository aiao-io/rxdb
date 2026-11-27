# refreshFormValidationResult()

```ts
function refreshFormValidationResult(result, fields, i18n?): FormValidationResult;
```

Defined in: [packages/rxdb-model/src/entity-form/form-validation.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-validation.ts#L49)

Replays the already-displayed validation errors with the current field labels and language, preserving the original input when parsing failed.

## Parameters

| Parameter | Type                                                            | Description                                    |
| --------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `result`  | [`FormValidationResult`](../interfaces/FormValidationResult.md) | The most recently displayed validation result. |
| `fields`  | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]         | The currently displayed fields.                |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md)                       | The current component runtime.                 |

## Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)

The result with refreshed copy; unknown external errors keep their original text.

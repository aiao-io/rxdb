# refreshFormValidationResult()

```ts
function refreshFormValidationResult(
   result, 
   fields, 
   i18n?
): FormValidationResult;
```

Defined in: packages/rxdb-model/dist/entity-form/form-validation.d.ts:26

Replays the already-displayed validation errors with the current field labels and language, preserving the original input when parsing failed.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `result` | [`FormValidationResult`](../interfaces/FormValidationResult.md) | The most recently displayed validation result. |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | The currently displayed fields. |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | The current component runtime. |

## Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)

The result with refreshed copy; unknown external errors keep their original text.

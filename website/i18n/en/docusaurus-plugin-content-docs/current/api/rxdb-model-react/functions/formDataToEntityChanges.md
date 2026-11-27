# formDataToEntityChanges()

```ts
function formDataToEntityChanges(original, formData, fields): Record<string, unknown>;
```

Defined in: packages/rxdb-model/dist/entity-form/form-data.d.ts:19

Computes the set of changes of the form data relative to the original entity object

## Parameters

| Parameter  | Type                                                    | Description                |
| ---------- | ------------------------------------------------------- | -------------------------- |
| `original` | `Record`&lt;`string`, `unknown`&gt;                     | The original entity object |
| `formData` | [`EntityFormData`](../interfaces/EntityFormData.md)     | Form data                  |
| `fields`   | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field configuration   |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The changed fields and their parsed new values

## Remarks

Read-only fields are skipped; the form value and original value are both parsed by field type before comparison, and fields with identical values (referentially or structurally equal) are not included in the change set

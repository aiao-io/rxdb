# formDataToEntityChanges()

```ts
function formDataToEntityChanges(
   original, 
   formData, 
   fields
): Record<string, unknown>;
```

Defined in: packages/rxdb-model/dist/entity-form/form-data.d.ts:19

Computes the change set of the form data relative to the original entity object

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `original` | `Record`&lt;`string`, `unknown`&gt; | The original entity object |
| `formData` | [`EntityFormData`](../interfaces/EntityFormData.md) | The form data |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field configs |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The changed fields and their parsed new values

## Remarks

Readonly fields are skipped; both the form value and the original value are parsed by field type before comparison,
and fields whose values are equal (by reference or structural equality) do not enter the change set

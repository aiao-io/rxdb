# formDataToEntityChanges()

```ts
function formDataToEntityChanges(original, formData, fields): Record<string, unknown>;
```

Defined in: [packages/rxdb-model/src/entity-form/form-data.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-data.ts#L34)

Computes the set of changes between the form data and the original entity object.

## Parameters

| Parameter  | Type                                                    | Description                   |
| ---------- | ------------------------------------------------------- | ----------------------------- |
| `original` | `Record`&lt;`string`, `unknown`&gt;                     | The original entity object    |
| `formData` | [`EntityFormData`](../interfaces/EntityFormData.md)     | The form data                 |
| `fields`   | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | The form field configurations |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The changed fields and their parsed new values

## Remarks

Read-only fields are skipped; both the form value and the original value are parsed per the field type before comparison,
and fields whose values are equal (by reference or structural equality) do not enter the change set.

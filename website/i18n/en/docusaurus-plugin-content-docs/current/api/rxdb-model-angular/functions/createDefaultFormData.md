# createDefaultFormData()

```ts
function createDefaultFormData(fields): EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/form-data.d.ts:26

Creates default form data based on the field configuration

## Parameters

| Parameter | Type                                                    | Description              |
| --------- | ------------------------------------------------------- | ------------------------ |
| `fields`  | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field configuration |

## Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

The default form data

## Remarks

Readonly fields do not participate; boolean fields default to false, string / number arrays default to empty arrays, and all other fields default to null

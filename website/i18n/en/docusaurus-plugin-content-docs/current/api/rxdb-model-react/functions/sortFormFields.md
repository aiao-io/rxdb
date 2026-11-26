# sortFormFields()

```ts
function sortFormFields(fields): FormFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-form/form-fields.d.ts:18

Sorts by the fields' order in ascending order

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field configuration |

## Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

The sorted field list

## Remarks

Fields without an order are treated as 0; returns a new array without modifying the original

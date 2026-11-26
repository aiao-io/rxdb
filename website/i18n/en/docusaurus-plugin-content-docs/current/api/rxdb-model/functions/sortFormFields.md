# sortFormFields()

```ts
function sortFormFields(fields): FormFieldConfig[];
```

Defined in: [packages/rxdb-model/src/entity-form/form-fields.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-fields.ts#L39)

Sorts fields by their `order` in ascending order.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | The form field configurations |

## Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

The sorted field list

## Remarks

Fields without an order are treated as 0; returns a new array without modifying the original.

# createDefaultFormData()

```ts
function createDefaultFormData(fields): EntityFormData;
```

Defined in: [packages/rxdb-model/src/entity-form/form-data.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-data.ts#L65)

Creates default form data from the field config

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field config |

## Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

Default form data

## Remarks

Read-only fields do not take part; boolean fields default to false, string / number arrays default to empty arrays, and all other fields default to null

# entityToFormData()

```ts
function entityToFormData(entity, fields): EntityFormData;
```

Defined in: [packages/rxdb-model/src/entity-form/form-data.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-data.ts#L17)

Converts an entity object into form data

## Parameters

| Parameter | Type                                                    | Description          |
| --------- | ------------------------------------------------------- | -------------------- |
| `entity`  | `Record`&lt;`string`, `unknown`&gt;                     | Source entity object |
| `fields`  | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field config    |

## Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

Form data containing only the fields declared in the field config

## Remarks

Fields that do not exist on the entity are filled with null

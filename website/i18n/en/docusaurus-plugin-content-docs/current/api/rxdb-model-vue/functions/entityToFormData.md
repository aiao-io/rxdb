# entityToFormData()

```ts
function entityToFormData(entity, fields): EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/form-data.d.ts:9

Converts an entity object into form data

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `Record`&lt;`string`, `unknown`&gt; | Source entity object |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | Form field configuration |

## Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

Form data containing only the fields declared in the field configuration

## Remarks

Fields missing on the entity are filled with null

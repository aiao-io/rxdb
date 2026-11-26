# buildFormFields()

```ts
function buildFormFields(
   metadata, 
   mode, 
   i18n?
): FormFieldConfig[];
```

Defined in: [packages/rxdb-model/src/entity-form/form-fields.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/form-fields.ts#L19)

Builds the form field list from entity metadata and the form mode.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `mode` | [`FormMode`](../type-aliases/FormMode.md) | The form mode |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

The list of form field configurations

## Remarks

Create mode excludes computed fields and contains no system fields; edit mode appends read-only system fields; view mode sets all fields to read-only.

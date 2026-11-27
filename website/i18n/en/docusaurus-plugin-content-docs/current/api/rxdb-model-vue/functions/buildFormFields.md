# buildFormFields()

```ts
function buildFormFields(metadata, mode, i18n?): FormFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-form/form-fields.d.ts:11

Builds the form field list from entity metadata and the form mode

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `mode`     | [`FormMode`](../type-aliases/FormMode.md)                     | Form mode       |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | -               |

## Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

List of form field configs

## Remarks

Create mode excludes computed fields and contains no system fields; edit mode appends readonly system fields; view mode sets all fields to readonly

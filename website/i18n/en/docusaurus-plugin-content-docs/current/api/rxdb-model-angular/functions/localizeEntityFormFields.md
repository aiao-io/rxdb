# localizeEntityFormFields()

```ts
function localizeEntityFormFields(
   metadata, 
   fields, 
   i18n?
): FormFieldConfig[];
```

Defined in: packages/rxdb-model/dist/localized-metadata.d.ts:19

Updates the display labels in an already-open form, keeping the field configuration and the caller's data state intact.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The original entity metadata the form belongs to. |
| `fields` | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] | The already-built form fields. |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | A component runtime that can inspect the catalog. |

## Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

Only fields that hit the catalog are cloned with their display names replaced.

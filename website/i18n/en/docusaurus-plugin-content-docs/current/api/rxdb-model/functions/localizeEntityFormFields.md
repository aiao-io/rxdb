# localizeEntityFormFields()

```ts
function localizeEntityFormFields(metadata, fields, i18n?): FormFieldConfig[];
```

Defined in: [packages/rxdb-model/src/localized-metadata.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/localized-metadata.ts#L94)

Updates the display labels in an already-open form, preserving the field configurations and the caller's data state.

## Parameters

| Parameter  | Type                                                          | Description                                         |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The original entity metadata the form belongs to.   |
| `fields`   | [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]       | The already-constructed form fields.                |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | The component runtime that can inspect the catalog. |

## Returns

[`FormFieldConfig`](../interfaces/FormFieldConfig.md)[]

Only fields that hit the catalog are cloned with their display names replaced.

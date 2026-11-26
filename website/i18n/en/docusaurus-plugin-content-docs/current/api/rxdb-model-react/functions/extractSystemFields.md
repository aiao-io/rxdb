# extractSystemFields()

```ts
function extractSystemFields(metadata, i18n?): EntityFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:76

Extracts system field configurations from entity metadata

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | -               |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

List of system field configurations

## Remarks

Always includes the read-only id field, and adds timestamp and audit fields according to the properties actually present in the metadata

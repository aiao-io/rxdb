# extractSystemFields()

```ts
function extractSystemFields(metadata, i18n?): EntityFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:76

Extracts the system field configurations from the entity metadata

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | -               |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

The list of system field configurations

## Remarks

Always includes the readonly id field, and supplements the timestamp and audit fields based on the properties that actually exist in the metadata

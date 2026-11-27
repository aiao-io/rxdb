# extractSystemFields()

```ts
function extractSystemFields(metadata, i18n?): EntityFieldConfig[];
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L204)

Extracts the system field configurations from entity metadata.

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | -               |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

The list of system field configurations

## Remarks

Always includes the read-only id field, and adds timestamp and audit fields for properties that actually exist in the metadata.

# extractEntityFields()

```ts
function extractEntityFields(metadata): EntityFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:69

Extracts all business field configurations from entity metadata

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

List of field configurations

## Remarks

Skips system fields and collects regular properties, computed properties, and relation fields in order

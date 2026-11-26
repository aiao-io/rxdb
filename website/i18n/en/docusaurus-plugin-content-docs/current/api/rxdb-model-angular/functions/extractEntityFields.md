# extractEntityFields()

```ts
function extractEntityFields(metadata): EntityFieldConfig[];
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:69

Extracts all business field configurations from the entity metadata

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

The list of field configurations

## Remarks

Skips system fields and collects ordinary properties, computed properties and relation fields in order

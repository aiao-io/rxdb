# extractEntityFields()

```ts
function extractEntityFields(metadata): EntityFieldConfig[];
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L167)

Extracts all business field configurations from entity metadata.

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

The list of field configurations

## Remarks

Skips system fields, and collects regular properties, computed properties, and relation fields in order.

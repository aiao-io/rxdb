# extractFieldsFromMetadata()

```ts
function extractFieldsFromMetadata(
   metadata, 
   allModels, 
   config?
): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:100

Extracts fields from EntityMetadata (supports recursive relations)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `allModels` | `Map`&lt;`string`, [`ModelInfo`](../interfaces/ModelInfo.md)&gt; | The map of all models |
| `config?` | [`FieldExtractorConfig`](../interfaces/FieldExtractorConfig.md) | Field extractor config |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

List of field metadata

## Remarks

This function recursively extracts all fields of the entity, including:
1. System fields (id, createdAt, updatedAt, etc.)
2. Entity property fields
3. Foreign key fields
4. Relation fields (recursive, until the depth limit is reached)

## Example

```typescript
const fields = extractFieldsFromMetadata(
  userMetadata,
  modelMap,
  `{ relationQueryDeep: 3 }`
);
// Returns: [
//   { name: 'id', displayName: 'ID', type: 'string' },
//   { name: 'name', displayName: 'Name', type: 'string' },
//   { name: 'orders', displayName: 'Orders (ONE_TO_MANY)', type: 'relation', ... },
//   { name: 'orders.id', displayName: 'Orders.ID', type: 'string' },
//   ...
// ]
```

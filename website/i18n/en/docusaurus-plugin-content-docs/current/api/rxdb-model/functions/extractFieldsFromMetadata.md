# extractFieldsFromMetadata()

```ts
function extractFieldsFromMetadata(
   metadata, 
   allModels, 
   config?
): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L148)

Extracts fields from EntityMetadata (supports recursive relations)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `allModels` | `Map`&lt;`string`, [`ModelInfo`](../interfaces/ModelInfo.md)&gt; | Mapping table of all models |
| `config?` | [`FieldExtractorConfig`](../interfaces/FieldExtractorConfig.md) | Field extractor config |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

Field metadata list

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
// returns: [
//   { name: 'id', displayName: 'ID', type: 'string' },
//   { name: 'name', displayName: 'Name', type: 'string' },
//   { name: 'orders', displayName: 'Orders (ONE_TO_MANY)', type: 'relation', ... },
//   { name: 'orders.id', displayName: 'Orders.ID', type: 'string' },
//   ...
// ]
```

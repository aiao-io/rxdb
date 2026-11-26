# extractRelationTargetFields()

```ts
function extractRelationTargetFields(metadata, config?): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L328)

Extracts fields of the relation target entity (used by EXISTS subqueries)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `config?` | [`FieldExtractorConfig`](../interfaces/FieldExtractorConfig.md) | Field extractor config |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

Field metadata list (one level only, no recursion)

## Remarks

This function extracts only one level of fields and does not recurse into relations. Used for the field list of EXISTS/NOT EXISTS subqueries.

## Example

```typescript
const fields = extractRelationTargetFields(orderMetadata);
// returns: [
//   { name: 'id', displayName: 'ID', type: 'string' },
//   { name: 'total', displayName: 'Total amount', type: 'number' },
//   { name: 'ownerId', displayName: 'User ID', type: 'string' },
//   ...
// ]
```

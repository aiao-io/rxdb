# extractRelationTargetFields()

```ts
function extractRelationTargetFields(metadata, config?): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:122

Extracts the fields of the relation target entity (used for EXISTS subqueries)

## Parameters

| Parameter  | Type                                                            | Description                   |
| ---------- | --------------------------------------------------------------- | ----------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)   | Entity metadata               |
| `config?`  | [`FieldExtractorConfig`](../interfaces/FieldExtractorConfig.md) | Field extractor configuration |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

Field metadata list (one level only, not recursive)

## Remarks

This function extracts only one level of fields and does not recurse into relations. Used for the field list of EXISTS/NOT EXISTS subqueries.

## Example

```typescript
const fields = extractRelationTargetFields(orderMetadata);
// Returns: [
//   { name: 'id', displayName: 'ID', type: 'string' },
//   { name: 'total', displayName: 'Total amount', type: 'number' },
//   { name: 'ownerId', displayName: 'User ID', type: 'string' },
//   ...
// ]
```

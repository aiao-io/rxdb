# organizeFields()

```ts
function organizeFields(fields): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:159

Groups and sorts fields

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fields` | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] | Field metadata list |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

The sorted field list

## Remarks

Sorting rules:
1. Sort by hierarchy depth (the number of '.' in the field name)
2. Within the same level, sort by field name alphabetically

## Example

```typescript
const fields = [
  { name: 'orders.id', ... },
  { name: 'name', ... },
  { name: 'id', ... },
  `{ name: 'orders.total', ... }`
];

const sorted = organizeFields(fields);
// Returns: [
//   { name: 'id', ... },
//   { name: 'name', ... },
//   { name: 'orders.id', ... },
//   `{ name: 'orders.total', ... }`
// ]
```

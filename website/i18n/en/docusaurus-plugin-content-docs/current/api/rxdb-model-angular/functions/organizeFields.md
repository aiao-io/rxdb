# organizeFields()

```ts
function organizeFields(fields): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:159

Groups and sorts the fields

## Parameters

| Parameter | Type                                                | Description            |
| --------- | --------------------------------------------------- | ---------------------- |
| `fields`  | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] | List of field metadata |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

The sorted list of fields

## Remarks

Sorting rules:

1. Sort by nesting depth (the number of '.' in the field name)
2. Within the same depth, sort by field name alphabetically

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

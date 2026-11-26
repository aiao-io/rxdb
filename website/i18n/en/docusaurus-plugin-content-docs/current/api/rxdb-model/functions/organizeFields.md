# organizeFields()

```ts
function organizeFields(fields): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:446](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L446)

Groups and orders fields

## Parameters

| Parameter | Type                                                | Description         |
| --------- | --------------------------------------------------- | ------------------- |
| `fields`  | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] | Field metadata list |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

The ordered field list

## Remarks

Ordering rules:

1. Sort by nesting depth (the number of '.' in the field name)
2. Within the same level, sort by field name in alphabetical order

## Example

```typescript
const fields = [
  { name: 'orders.id', ... },
  { name: 'name', ... },
  { name: 'id', ... },
  `{ name: 'orders.total', ... }`
];

const sorted = organizeFields(fields);
// returns: [
//   { name: 'id', ... },
//   { name: 'name', ... },
//   { name: 'orders.id', ... },
//   `{ name: 'orders.total', ... }`
// ]
```

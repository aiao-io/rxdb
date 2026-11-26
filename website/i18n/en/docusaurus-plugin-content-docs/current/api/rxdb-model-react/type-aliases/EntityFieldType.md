# EntityFieldType

```ts
type EntityFieldType = 
  | PropertyType
  | `${bigint}`
  | `${binary}`
  | `${boolean}`
  | `${date}`
  | `${enum}`
  | `${integer}`
  | `${number}`
  | `${string}`
  | `${uuid}`
  | `${numberArray}`
  | `${stringArray}`
  | `${keyValue}`
  | `${json}`
  | "oneToOne"
  | "manyToOne"
  | "computed";
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:7

Entity field type

## Remarks

Compatible with the PropertyType enum values and their string literal forms, and includes the identifiers for relation fields (oneToOne / manyToOne) and computed fields (computed)

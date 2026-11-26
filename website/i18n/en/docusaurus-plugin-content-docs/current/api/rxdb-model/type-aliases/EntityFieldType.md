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
  | 'oneToOne'
  | 'manyToOne'
  | 'computed';
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L22)

Entity field type

## Remarks

Compatible with the PropertyType enum values and their string literal forms, plus the identifiers for relation fields (oneToOne / manyToOne) and computed fields (computed)

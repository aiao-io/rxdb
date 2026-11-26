# PropertyTypeString

```ts
type PropertyTypeString =
  | 'uuid'
  | 'string'
  | 'enum'
  | 'number'
  | 'integer'
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'binary'
  | 'stringArray'
  | 'numberArray'
  | 'keyValue'
  | 'json'
  | 'oneToOne'
  | 'manyToOne'
  | 'computed';
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:12

Entity property type string literals
One-to-one with the `PropertyType` enum values of `@aiao/rxdb`, extended with relation types and computed properties

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

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L28)

String literal of entity property types
One-to-one with the `PropertyType` enum values of `@aiao/rxdb`, plus relation types and computed properties

# PropertyTypeString

```ts
type PropertyTypeString = 
  | "uuid"
  | "string"
  | "enum"
  | "number"
  | "integer"
  | "bigint"
  | "boolean"
  | "date"
  | "binary"
  | "stringArray"
  | "numberArray"
  | "keyValue"
  | "json"
  | "oneToOne"
  | "manyToOne"
  | "computed";
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:12

String literal of entity property types
Corresponds one-to-one with the `PropertyType` enum values of `@aiao/rxdb`, plus extensions for relation types and computed properties

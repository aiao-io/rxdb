# ~~Type Alias: EntityFieldType~~

```ts
type EntityFieldType = 
  | PropertyType
  | "oneToOne"
  | "manyToOne"
  | "computed";
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L44)

## Deprecated

Use the `valueType` / `source` of [EntityFieldDescriptor](EntityFieldDescriptor.md) instead.
This alias collapses computed fields into `'computed'` and relations into `'oneToOne'` / `'manyToOne'`,
losing the real value type, and it cannot express `1:m` / `m:n`.

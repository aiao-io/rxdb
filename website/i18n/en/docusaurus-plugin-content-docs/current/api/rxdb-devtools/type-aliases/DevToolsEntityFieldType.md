# DevToolsEntityFieldType

```ts
type DevToolsEntityFieldType =
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

Defined in: [types.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L238)

Model field type; only the stable strings needed for table display are allowed.

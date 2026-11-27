# OperatorName

```ts
type OperatorName =
  | '='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'notStartsWith'
  | 'endsWith'
  | 'notEndsWith'
  | 'null'
  | 'notNull'
  | 'in'
  | 'notIn'
  | 'between'
  | 'notBetween'
  | 'exists'
  | 'notExists'
  | (string & Record<never, never>);
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L136)

All operators

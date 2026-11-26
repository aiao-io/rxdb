# OperatorName

```ts
type OperatorName = 
  | "="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "contains"
  | "notContains"
  | "startsWith"
  | "notStartsWith"
  | "endsWith"
  | "notEndsWith"
  | "null"
  | "notNull"
  | "in"
  | "notIn"
  | "between"
  | "notBetween"
  | "exists"
  | "notExists"
  | string & Record<never, never>;
```

Defined in: packages/rxdb/dist/repository/query.interface.d.ts:92

All operators

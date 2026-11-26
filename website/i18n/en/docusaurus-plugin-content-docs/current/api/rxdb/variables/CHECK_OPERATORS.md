# CHECK_OPERATORS

```ts
const CHECK_OPERATORS: readonly ["=", "!=", "<", ">", "<=", ">=", "in", "notIn", "between", "notBetween", "null", "notNull"];
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L35)

Whitelist of CHECK operators (US-030 AC#9). The `exists` / `contains` family / `startsWith` family are not included.

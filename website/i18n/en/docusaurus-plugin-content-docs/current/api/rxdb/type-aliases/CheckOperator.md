# CheckOperator

```ts
type CheckOperator = typeof CHECK_OPERATORS[number];
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L57)

Operators allowed in single-row CHECK rules.

## Remarks

Deliberately not reusing the query `OperatorName`: that union contains `contains` / `startsWith` / `exists` and
others whose semantics are inconsistent with single-row CHECK or which require a subquery; the type layer must block
them.

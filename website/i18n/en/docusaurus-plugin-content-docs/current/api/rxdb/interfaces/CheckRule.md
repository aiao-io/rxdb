# CheckRule

Defined in: [packages/rxdb/src/entity/check-constraint.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L83)

CHECK single-row rule: a field compared against a literal, or a field-to-field (`ref`) comparison, or a null check.

- `value` only appears on comparison / membership / range operators, and is compiled into a literal according to the field's column type;
- `ref` points to another column of the same entity, only pairs with comparison operators, and is mutually exclusive with `value`;
- `null` / `notNull` carry neither.

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L85)

The field participating in the comparison (a property name; relation paths are not supported).

***

### operator \{#operator\}

```ts
operator: 
  | "="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "in"
  | "notIn"
  | "between"
  | "notBetween"
  | "null"
  | "notNull";
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L87)

The operator, limited to [CHECK\_OPERATORS](../variables/CHECK_OPERATORS.md).

***

### ref? \{#ref\}

```ts
ref?: string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L91)

The target field of the field-to-field comparison (another column of the same entity).

***

### value? \{#value\}

```ts
value?: unknown;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L89)

The literal used in the comparison; `in` / `notIn` take an array, `between` / `notBetween` take a pair.

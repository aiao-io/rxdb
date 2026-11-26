# CompiledCheckConstraint

Defined in: [packages/rxdb/src/entity/check-constraint.ts:456](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L456)

Compiles an entity-level CHECK into `{ name, expression }`: the constraint name + the normalized expression.

## Properties

### expression \{#expression\}

```ts
expression: string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:460](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L460)

The normalized SQL expression (embeddable directly into `CONSTRAINT ... CHECK (...)`).

***

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:458](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L458)

The deterministic constraint name (containing the `ck_` prefix and the expression hash).

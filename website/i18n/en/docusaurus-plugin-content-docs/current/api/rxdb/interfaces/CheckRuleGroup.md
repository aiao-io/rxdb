# CheckRuleGroup

Defined in: [packages/rxdb/src/entity/check-constraint.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L97)

CHECK rule group: same shape as the query `RuleGroup` (`combinator` + recursive `rules`), narrowed to the single-row subset.

## Properties

### combinator \{#combinator\}

```ts
combinator: "and" | "or";
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L98)

***

### rules \{#rules\}

```ts
rules: readonly (CheckRule | CheckRuleGroup)[];
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L99)

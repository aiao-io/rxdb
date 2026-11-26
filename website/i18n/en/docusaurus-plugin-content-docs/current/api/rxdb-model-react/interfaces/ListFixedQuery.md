# ListFixedQuery

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:6

Fixed query for the list (passed in from the relationship tab on the detail page); the structure matches a rule group of the query builder

## Properties

### combinator \{#combinator\}

```ts
readonly combinator: "and" | "or";
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:8

How the rules are combined

---

### rules \{#rules\}

```ts
readonly rules: readonly unknown[];
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:10

Rules; nested rule groups are considered unable to pin a single ordering domain

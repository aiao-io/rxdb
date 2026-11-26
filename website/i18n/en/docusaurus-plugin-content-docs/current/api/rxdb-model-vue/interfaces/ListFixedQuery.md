# ListFixedQuery

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:6

Fixed query of the list (passed in from the relation tab of the detail page); its structure is the same as the query builder's rule group

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

Rules; nested rule groups are treated as not able to pin the ordering domain

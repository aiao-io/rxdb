# ListFixedQuery

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:6

The fixed query of the list (passed in from the relation tab of the detail page); same structure as the query builder's rule groups

## Properties

### combinator \{#combinator\}

```ts
readonly combinator: "and" | "or";
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:8

How the rules are combined

***

### rules \{#rules\}

```ts
readonly rules: readonly unknown[];
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:10

Rules; nested rule groups are treated as not pinning the ordering domain

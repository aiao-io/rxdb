# ListFixedQuery

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L22)

Fixed query for the list (passed in by the relation tab of the detail page); the structure matches the query builder's rule group

## Properties

### combinator \{#combinator\}

```ts
readonly combinator: "and" | "or";
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L24)

How the rules combine

---

### rules \{#rules\}

```ts
readonly rules: readonly unknown[];
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L26)

Rules; nested rule groups are treated as not being able to pin the ordering domain

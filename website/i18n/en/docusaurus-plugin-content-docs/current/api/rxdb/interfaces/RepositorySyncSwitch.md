# RepositorySyncSwitch

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L213)

Repository sync switch: the one field of `RxDBSync` that eligibility checks depend on.

## Remarks

Deliberately declares only `enabled`, so that the eligibility predicates need not depend on a complete
`RxDBSync` instance — status display, batch enumeration, and the per-repository entry point each hold records
of different shapes, and this one field is all they share.

## Properties

### enabled? \{#enabled\}

```ts
enabled?: boolean | null;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L215)

This repository's sync switch on the current branch.

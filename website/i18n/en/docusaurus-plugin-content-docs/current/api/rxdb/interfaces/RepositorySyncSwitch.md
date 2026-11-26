# RepositorySyncSwitch

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L213)

Repository sync switch: the one field in `RxDBSync` relevant to eligibility determination

## Remarks

Deliberately declares only `enabled`, so the determination predicates do not need a full `RxDBSync` instance — the records from status display,
bulk enumeration, and the single-repository entry point have different shapes, and this is the only field they share.

## Properties

### enabled? \{#enabled\}

```ts
enabled?: boolean | null;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L215)

The sync switch of this repository on the current branch

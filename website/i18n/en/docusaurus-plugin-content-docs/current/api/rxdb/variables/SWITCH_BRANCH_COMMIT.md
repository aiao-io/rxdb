# SWITCH_BRANCH_COMMIT

```ts
const SWITCH_BRANCH_COMMIT: 'SWITCH_BRANCH_COMMIT';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L71)

The branch switch was committed.

## Remarks

Only after receiving this do `activated` and all change log triggers point at the new branch. Writes that land afterwards are tagged with the new branch.

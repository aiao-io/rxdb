# MERGE_BRANCH_FAILED

```ts
const MERGE_BRANCH_FAILED: "MERGE_BRANCH_FAILED";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L90)

Event type for a failed branch merge.

## Remarks

**Failure does not mean rollback.** The `normal` strategy of `merge_branch` calls `adapter.mergeChanges` one change at a time; each call is its own transaction, but the loop as a whole has no boundary: when change k fails, the previous k-1 changes are already persisted, and the triggers have already generated the corresponding `RxDBChange` rows on the target branch. Receiving this event only lets you infer that "the merge did not run to completion" — not that "the data is back to its pre-merge state".

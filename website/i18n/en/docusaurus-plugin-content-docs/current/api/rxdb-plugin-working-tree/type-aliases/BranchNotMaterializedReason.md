# BranchNotMaterializedReason

```ts
type BranchNotMaterializedReason =
  | 'stage_missing'
  | 'stage_incomplete'
  | 'intent_drift'
  | 'target_already_materialized'
  | 'stage_tampered'
  | 'source_unavailable'
  | 'source_failed'
  | 'page_conflict';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L89)

Why one materialization attempt was rejected; the caller uses it to decide whether to retry, re-pull, or give up.

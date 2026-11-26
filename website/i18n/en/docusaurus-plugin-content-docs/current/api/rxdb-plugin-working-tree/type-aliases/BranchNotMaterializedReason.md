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

The cause of a rejected materialization; the caller decides based on it whether to retry, pull again, or give up.

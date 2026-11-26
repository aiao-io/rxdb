# ConflictResolution

```ts
type ConflictResolution = 
  | {
  type: "KEEP_LOCAL";
}
  | {
  type: "KEEP_REMOTE";
}
  | {
  merged: Record<string, unknown>;
  type: "MERGE";
}
  | {
  type: "DEFER";
};
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L47)

Conflict resolution result

## Remarks

**At runtime only `KEEP_LOCAL` and `KEEP_REMOTE` can be applied automatically.**

When `MERGE` or `DEFER` is returned, `pull` dispatches [ConflictPendingEvent](../classes/ConflictPendingEvent.md) to hand over
the list of conflicts awaiting resolution, then **fails and rolls back the whole round** — nothing lands locally and
the watermark does not advance. This is not a bug fallback but a deliberate fail-closed design: the watermark is a
monotonic cursor, and advancing it past a skipped change loses that change forever, while the engine has no
per-entity pending-conflict store to catch it.

Therefore `PullResult.conflictsDeferred` is always `0` in a successful result.

For three-way merges or interactive selection, the correct usage is: after receiving
[ConflictPendingEvent](../classes/ConflictPendingEvent.md), finish the merge on the application side, apply the result as a
normal local write, and call `pull()` again — at that point the resolver returning `KEEP_LOCAL` / `KEEP_REMOTE`
converges.

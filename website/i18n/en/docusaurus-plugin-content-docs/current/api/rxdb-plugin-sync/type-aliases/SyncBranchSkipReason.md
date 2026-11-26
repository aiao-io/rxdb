# SyncBranchSkipReason

```ts
type SyncBranchSkipReason = 
  | {
  cause: "invalid-id";
}
  | {
  cause: "unresolved-from-change-id";
}
  | {
  ancestorId: string;
  cause: "ancestor-skipped";
};
```

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L67)

The specific reason a remote branch was skipped this round.

## Remarks

The three causes are mutually exclusive — the processing order guarantees each
skipped branch falls into exactly one of them:
- `invalid-id`: the branch's own id does not fit the local `rxdb_branch.id` (see isUsableBranchId).
- `unresolved-from-change-id`: the fork-point change has not been pulled
  locally yet, and `fromChangeId` cannot be translated into a local id.
- `ancestor-skipped`: the branch itself is fine, but its **direct parent** was
  skipped this round (no matter which cause skipped the parent). `ancestorId`
  records that direct parent's id, not the root cause at the top of the chain —
  to trace the root cause, recurse up via `skipReasons[ancestorId]` until the
  cause found is no longer `ancestor-skipped`.

# WorkingTreeBranchFromCommitRejection

```ts
type WorkingTreeBranchFromCommitRejection = "unreachable_target" | "fork_point_unknown" | "history_rewritten";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts#L31)

Why a commit cannot be used to create a branch

## Remarks

- `unreachable_target`: not on the current branch HEAD's reachable parent chain; same name and meaning as restore's;
- `fork_point_unknown`: this commit did not record a fork point — commits from before the fork point table existed, or the baseline written when a metadata-only branch first materialized;
- `history_rewritten`: an undo or redo happened after the commit, modifying the stretch of change log the new branch would inherit, so what switching over reads is no longer the data at commit time.

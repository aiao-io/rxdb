# WorkingTreeBranchFromCommitRejection

```ts
type WorkingTreeBranchFromCommitRejection = "unreachable_target" | "fork_point_unknown" | "history_rewritten";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts#L31)

The cause of a commit not being usable to create a branch

## Remarks

- `unreachable_target`: not on the current branch HEAD's reachable parent chain, same name and meaning as restore;
- `fork_point_unknown`: this commit did not record a fork point — commits from before the fork point table
  existed, or the baseline written by the first materialization of a metadata-only branch;
- `history_rewritten`: there was an undo or redo after the commit, altering the stretch of change log the new
  branch would inherit, so switching over would no longer read the data as of that commit.

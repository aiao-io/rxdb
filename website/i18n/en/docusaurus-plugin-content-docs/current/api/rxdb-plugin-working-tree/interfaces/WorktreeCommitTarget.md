# WorktreeCommitTarget

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts#L12)

The commit view: the tracked data at the moment a reachable commit on the current active branch has just completed.

## Properties

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts#L14)

The target commit id; must be on the reachable parent chain of the active branch HEAD, same criterion as `restore()`

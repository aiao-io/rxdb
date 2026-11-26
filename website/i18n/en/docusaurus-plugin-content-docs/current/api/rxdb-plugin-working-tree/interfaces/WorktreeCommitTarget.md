# WorktreeCommitTarget

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts#L12)

The commit view: the tracked data as of the moment a reachable commit on the current active branch just finished.

## Properties

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts#L14)

The target commit id; must be on the active branch HEAD's reachable parent chain, same criterion as `restore()`

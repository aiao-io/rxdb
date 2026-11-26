# WorkingTreeCommitEvent

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts#L14)

A commit that **actually wrote a new commit**, emitted by the facade's `commits$` after the transaction commits.

## Remarks

Only two fields, no message, author, or change unit count: what subscribers need is the association key "which commit, which branch",
and everything else is read with `commitId` via `listCommits()` / `commitChanges()` — what comes back there is the post-persist truth.
Forwarding the whole `CommitResult` would let subscribers store bookkeeping values like `headRevision`, which only hold at the moment
of the call, as historical facts.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts#L18)

Which branch this commit landed on

***

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts#L16)

The id of the new commit

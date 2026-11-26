# WorkingTreeCommitEvent

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts#L14)

A commit that **actually wrote a new commit**, emitted by the facade's `commits$` after the transaction commits.

## Remarks

Only two fields, no message, author or change unit count: what subscribers want is the "which commit, which branch" association key pair; everything else is read via `commitId` from `listCommits()` / `commitChanges()`, and what is read there is the true post-persist value.
Forwarding the whole `CommitResult` would let subscribers store bookkeeping values like `headRevision` — true only at the moment of the call — as historical facts.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts#L18)

Which branch this commit landed on

---

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commit-event.ts#L16)

The new commit's id

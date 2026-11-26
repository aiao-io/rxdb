# CommitConflictKind

```ts
type CommitConflictKind = 'working_tree_revision' | 'head_revision' | 'activation_revision';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L40)

The conflict kinds corresponding to the three comparisons.

## Remarks

The value domain and "how many comparisons there are" are two ways of writing the same thing: one fewer value
means one fewer comparison. So this is not descriptive copy — changing it changes the strength of the
concurrency arbitration.

When the captured `branchId` is **not the same** as the current active branch, it is also classified as
`activation_revision` — together with "the activation number mismatches on the same branch", it falls under
"the work tree you are looking at is not this one", rather than getting a value of its own that makes callers
branch one more way. The two are told apart by
[CommitConflict.branchId](../interfaces/CommitConflict.md#branchid): it is always the **current** active branch.

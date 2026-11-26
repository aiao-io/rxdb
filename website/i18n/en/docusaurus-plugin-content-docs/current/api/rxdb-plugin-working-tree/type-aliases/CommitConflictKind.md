# CommitConflictKind

```ts
type CommitConflictKind = 'working_tree_revision' | 'head_revision' | 'activation_revision';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L40)

The conflict kind corresponding to each of the three comparisons.

## Remarks

The value domain and "how many comparisons there are" are two ways of writing the same thing: one fewer value means one fewer comparison.
So it is not descriptive text; changing it changes the strength of the concurrency arbitration.

When the captured `branchId` is **not the same branch** as the current active branch, it also falls under
`activation_revision` — it and "the activation number does not match on the same branch" both mean "what you are looking at is not this working tree",
rather than opening another value that makes callers branch one more way. The two are distinguished by
[CommitConflict.branchId](../interfaces/CommitConflict.md#branchid): it is always the **current** active branch.

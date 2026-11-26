# WorkingTreeRevisionSnapshot

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L96)

The current values of the three positions the command read inside its own write transaction.

## Remarks

Deliberately shaped differently from [WorkingTreeCredentials](WorkingTreeCredentials.md): if the two shared a shape, the caller could pass the same object as both expected and actual into [findCommitConflict](../functions/findCommitConflict.md), which is exactly the pattern point 2 exists to rule out.

## Properties

### headRevision \{#headrevision\}

```ts
readonly headRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L101)

The current value of `CommitBranchRef.headRevision`

---

### token \{#token\}

```ts
readonly token: ActiveBranchToken;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L98)

The active branch token read inside the transaction

---

### workingTreeRevision \{#workingtreerevision\}

```ts
readonly workingTreeRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L104)

The current value of `WorkingTreeState.workingTreeRevision`

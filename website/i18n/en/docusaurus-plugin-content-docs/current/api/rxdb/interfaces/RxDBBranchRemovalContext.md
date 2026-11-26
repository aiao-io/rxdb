# RxDBBranchRemovalContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L93)

The context a contributor needs to clean up its own rows when a branch is removed.

## Remarks

Has only two fields, word-for-word identical in shape to [RxDBBranchCreationContext](RxDBBranchCreationContext.md) — the two are
the birth and death of the same branch. Different shapes would mean row creation and row deletion each recognize
a different "which branch this is", and the day they drift apart, the rows of a different branch get deleted.

**No `entityManager`.** Creating a branch needs `instantiate()` to build row objects, while deleting one only needs to
read the rows first and then hand them to `executor.removeMany()`; carrying an extra unused parameter would be
an invitation for contributors to create new rows on the cleanup path.

The call happens **before the branch row itself is deleted**: the "find child branches → find change → delete" part of
`remove_branch` is a piece of ordered validation, and if a contributor deletes `rxdb_branch` first, that validation
would read a branch that no longer exists.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L98)

The id of the branch that is about to be deleted and is still in the database at this moment.

---

### executor \{#executor\}

```ts
readonly executor: TransactionExecutor;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L95)

The transaction executor that is deleting this branch.

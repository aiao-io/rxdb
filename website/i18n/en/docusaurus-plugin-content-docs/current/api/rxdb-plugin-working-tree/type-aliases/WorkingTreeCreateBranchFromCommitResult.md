# WorkingTreeCreateBranchFromCommitResult

```ts
type WorkingTreeCreateBranchFromCommitResult = 
  | {
  branch: RxDBBranch;
  ok: true;
}
  | {
  ok: false;
  reason: WorkingTreeBranchFromCommitRejection;
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts#L55)

Result of [WorkingTreeManager.createBranchFromCommit](../classes/WorkingTreeManager.md#createbranchfromcommit)

## Union Members

### Type Literal

```ts
{
  branch: RxDBBranch;
  ok: true;
}
```

#### branch

```ts
readonly branch: RxDBBranch;
```

The branch just created; nothing has switched over

#### ok

```ts
readonly ok: true;
```

Discriminator: created

***

### Type Literal

```ts
{
  ok: false;
  reason: WorkingTreeBranchFromCommitRejection;
}
```

#### ok

```ts
readonly ok: false;
```

Discriminator: not created, not one row written

#### reason

```ts
readonly reason: WorkingTreeBranchFromCommitRejection;
```

Why it was not created

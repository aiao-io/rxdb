# WorkingTreeBranchFromCommitCheck

```ts
type WorkingTreeBranchFromCommitCheck =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: WorkingTreeBranchFromCommitRejection;
    };
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts#L38)

Result of [WorkingTreeManager.checkBranchFromCommit](../classes/WorkingTreeManager.md#checkbranchfromcommit)

## Union Members

### Type Literal

```ts
{
  ok: true;
}
```

#### ok

```ts
readonly ok: true;
```

Discriminator: can be used to create a branch

---

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

Discriminator: cannot be used to create a branch

#### reason

```ts
readonly reason: WorkingTreeBranchFromCommitRejection;
```

Why it cannot

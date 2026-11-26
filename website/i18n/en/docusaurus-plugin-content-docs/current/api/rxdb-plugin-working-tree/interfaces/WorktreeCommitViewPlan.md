# WorktreeCommitViewPlan

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commit-view.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commit-view.ts#L30)

The path to walk back when the commit view can be opened.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commit-view.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commit-view.ts#L32)

The current active branch

---

### path \{#path\}

```ts
readonly path: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commit-view.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commit-view.ts#L34)

The commits to apply in reverse, in replay order (HEAD first), excluding the target commit itself

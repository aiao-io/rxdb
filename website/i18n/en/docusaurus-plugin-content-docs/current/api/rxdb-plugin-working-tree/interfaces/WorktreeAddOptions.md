# WorktreeAddOptions

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L89)

Options for [WorktreeManager.add](../classes/WorktreeManager.md#add).

## Properties

### name? \{#name\}

```ts
readonly name?: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L91)

The name (GitHub Desktop's Worktree name); defaults to the branch id

---

### owner? \{#owner\}

```ts
readonly owner?: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L99)

The ownership, defaulting to `persistent`.

#### Remarks

`persistent`: like git and GitHub Desktop, survives restarts, and the branch stays held until [WorktreeManager.remove](../classes/WorktreeManager.md#remove).
`session`: once the claiming tab (or Node process) ends, any `prune()` can reclaim it; uncommitted changes remain on the branch.

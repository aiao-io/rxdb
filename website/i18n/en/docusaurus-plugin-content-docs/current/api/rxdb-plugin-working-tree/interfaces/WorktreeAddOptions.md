# WorktreeAddOptions

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L89)

The options of [WorktreeManager.add](../classes/WorktreeManager.md#add).

## Properties

### name? \{#name\}

```ts
readonly name?: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L91)

The name (the Worktree name in GitHub Desktop), defaults to the branch id

***

### owner? \{#owner\}

```ts
readonly owner?: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L99)

The ownership, defaults to `persistent`.

#### Remarks

`persistent`: consistent with git and GitHub Desktop, it survives restarts, and the branch stays held until [WorktreeManager.remove](../classes/WorktreeManager.md#remove).
`session`: once the tab (or Node process) that claims it ends, any `prune()` anywhere can reclaim it; uncommitted changes stay on the branch.

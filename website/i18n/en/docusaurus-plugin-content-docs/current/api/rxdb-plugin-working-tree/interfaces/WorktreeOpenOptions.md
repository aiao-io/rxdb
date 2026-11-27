# WorktreeOpenOptions

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L77)

Options for [WorktreeManager.open](../classes/WorktreeManager.md#open).

## Properties

### owner? \{#owner\}

```ts
readonly owner?: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L85)

The ownership, defaulting to `session`.

#### Remarks

`session`: once the opening tab (or Node process) ends, any `prune()` can reclaim it.
`persistent`: stays in the registry after a refresh; re-open it with [WorktreeManager.attach](../classes/WorktreeManager.md#attach); `close()` explicitly when done with it.

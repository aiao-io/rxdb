# WorktreeOpenOptions

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L77)

The options of [WorktreeManager.open](../classes/WorktreeManager.md#open).

## Properties

### owner? \{#owner\}

```ts
readonly owner?: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L85)

The ownership, defaults to `session`.

#### Remarks

`session`: once the tab (or Node process) that opened it ends, any `prune()` anywhere can reclaim it.
`persistent`: it stays registered after a refresh and is reopened with [WorktreeManager.attach](../classes/WorktreeManager.md#attach); call `close()` explicitly when done.

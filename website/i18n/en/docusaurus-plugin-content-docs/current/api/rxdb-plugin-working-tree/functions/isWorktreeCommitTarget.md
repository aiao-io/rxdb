# isWorktreeCommitTarget()

```ts
function isWorktreeCommitTarget(target): target is WorktreeCommitTarget;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-target.ts#L26)

Whether this is a commit view.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`WorktreeTarget`](../type-aliases/WorktreeTarget.md) | The HEAD of a checkout |

## Returns

`target is WorktreeCommitTarget`

`true` when it is a commit view

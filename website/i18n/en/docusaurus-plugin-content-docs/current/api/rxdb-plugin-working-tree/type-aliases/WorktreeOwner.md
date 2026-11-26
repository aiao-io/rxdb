# WorktreeOwner

```ts
type WorktreeOwner = "session" | "persistent";
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L25)

Who owns a worktree: a tab session (reclaimable when the session ends), or persistent (survives refresh).

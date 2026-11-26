# WorktreeLockRelease

```ts
type WorktreeLockRelease = () => Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-locks.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-locks.ts#L15)

Releases a worktree lock; settles only after the lock is truly returned; repeated calls are no-ops.

## Returns

`Promise`&lt;`void`&gt;

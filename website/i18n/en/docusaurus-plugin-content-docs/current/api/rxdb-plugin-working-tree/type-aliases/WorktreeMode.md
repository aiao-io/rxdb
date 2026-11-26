# WorktreeMode

```ts
type WorktreeMode = "read_only" | "writable";
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L22)

Whether a worktree can be written.

- `read_only`: an independent snapshot database, browsed through a second read-only instance (US-313)
- `writable`: a set of shadow tables in the same database; the main instance mounts it to read, write, and
  commit (US-314); HEAD can only be a branch

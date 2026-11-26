# WorktreeSnapshotCursor

```ts
type WorktreeSnapshotCursor = string | number;
```

Defined in: [packages/rxdb/src/worktree-snapshot.interface.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/worktree-snapshot.interface.ts#L21)

Pagination cursor: the position of the last row of the previous page.

## Remarks

The shape is decided by the backend (rowid for the SQLite family, primary key for PGlite); callers only pass it back
as-is.

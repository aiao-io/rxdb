# WorktreeAdapterFactory

```ts
type WorktreeAdapterFactory = AdapterFactory;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts#L17)

Builds the local adapter for a snapshot instance: the same shape as the `rxdb.adapter()` factory.

## Remarks

The storage location is determined by the input `db.config.dbName`, one database name per worktree; what it
builds must be the same backend as the main database.

The main instance's adapter factory cannot be reused as-is: a SharedWorker named after the outer database
name or a constant, or a Worker client that returns immediately once initialized, would both make the second
instance quietly connect to the main database. The snapshot instance has an extra fallback of its own: it
carries a migration registered only on snapshot databases, so a real connection to the main database fails
at connect time.

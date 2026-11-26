# WorktreeAdapterFactory

```ts
type WorktreeAdapterFactory = AdapterFactory;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-options.ts#L17)

Builds a local adapter for a snapshot instance: same shape as the `rxdb.adapter()` factory.

## Remarks

The storage location is determined by the input `db.config.dbName`, one database name per checkout; what is built must be the same backend as the main database.

The main instance's adapter factory cannot be copied verbatim: a SharedWorker named by the outer database name or a constant, or a Worker client that returns immediately when already initialized,
would both silently connect the second instance to the main database. The snapshot instance has one more fallback: it carries a migration registered only on snapshot databases,
so if it really connects to the main database it fails at connect time.

# rxDBPluginWorkingTree

```ts
const rxDBPluginWorkingTree: Plugin<RxDBPluginWorkingTreeOptions>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L368)

The RxDB working tree plugin factory.

## Example

```ts
rxdb.use(rxDBPluginWorkingTree, {
  // The snapshot database for read-only worktrees: the same backend as the main database,
  // with separate storage per worktree keyed by db.config.dbName
  worktrees: `{ adapter: db => new RxDBAdapterPGlite(db, { store: 'memory' }) }`
});
```

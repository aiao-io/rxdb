# rxDBPluginWorkingTree

```ts
const rxDBPluginWorkingTree: Plugin<RxDBPluginWorkingTreeOptions>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L368)

RxDB working tree plugin factory.

## Example

```ts
rxdb.use(rxDBPluginWorkingTree, {
  // snapshot database for read-only checkouts: same backend as the main database,
  // separate storage per checkout via db.config.dbName
  worktrees: `{ adapter: db => new RxDBAdapterPGlite(db, { store: 'memory' }) }`
});
```

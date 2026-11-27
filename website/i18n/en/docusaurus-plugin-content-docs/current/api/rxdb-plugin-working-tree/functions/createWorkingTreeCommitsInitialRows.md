# createWorkingTreeCommitsInitialRows()

```ts
function createWorkingTreeCommitsInitialRows(entityManager, branchIds): any[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/migrations/0004-working-tree-commits.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/migrations/0004-working-tree-commits.ts#L54)

Creates all initial rows of the epic-006 persistence layer (§8 steps 2–3)

## Parameters

| Parameter       | Type                                                      | Description                                                       |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `entityManager` | [`EntityManager`](../../rxdb/interfaces/EntityManager.md) | The entity manager used for `instantiate()`                       |
| `branchIds`     | readonly `string`[]                                       | The branch ids to initialize, in the order generations are issued |

## Returns

`any`[]

Unpersisted initial row instances; the caller is responsible for writing them in **one** transaction

## Remarks

New and existing databases take two completely different paths — a new database writes them once alongside table creation in `createTables()`, an existing one backfills them in createWorkingTreeCommitsMigration's transaction. The two paths' initial values must be field-for-field identical, otherwise "newly created" and "upgraded" databases are two kinds of databases from day one. So initial rows are generated in this one place only, and both sides call it.

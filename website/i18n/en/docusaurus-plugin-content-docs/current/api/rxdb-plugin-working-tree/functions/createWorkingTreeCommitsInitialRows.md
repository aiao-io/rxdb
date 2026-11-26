# createWorkingTreeCommitsInitialRows()

```ts
function createWorkingTreeCommitsInitialRows(entityManager, branchIds): any[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/migrations/0004-working-tree-commits.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/migrations/0004-working-tree-commits.ts#L54)

Creates all initial rows of the epic-006 persistence layer (§8 steps 2–3).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityManager` | [`EntityManager`](../../rxdb/interfaces/EntityManager.md) | The entity manager used for `instantiate()` |
| `branchIds` | readonly `string`[] | The ids of the branches to initialize, in the order generations are issued |

## Returns

`any`[]

The not-yet-persisted initial row instances; the caller is responsible for writing them in **one** transaction

## Remarks

New and existing databases go through two completely different paths — a new database writes them once along with table creation in `createTables()`, while an existing database backfills them in createWorkingTreeCommitsMigration's transaction. The initial values on the two paths must be field-for-field identical, otherwise "newly created" and "migrated up" databases would be two kinds of databases from day one. That is why initial rows are generated in exactly this one place, called by both sides.

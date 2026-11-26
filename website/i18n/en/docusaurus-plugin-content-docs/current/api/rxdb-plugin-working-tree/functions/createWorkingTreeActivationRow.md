# createWorkingTreeActivationRow()

```ts
function createWorkingTreeActivationRow(
   entityManager, 
   branchGenerationSeq, 
   id?
): WorkingTreeActivationState;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L97)

Creates the activation state's initial row (not yet persisted).

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `entityManager` | [`EntityManager`](../../rxdb/interfaces/EntityManager.md) | `undefined` | The entity manager used for `instantiate()` |
| `branchGenerationSeq` | `number` | `undefined` | The branch generation already issued up to; 0 for a new database, or the number of branches backfilled by the migration for an existing one; a writable checkout's row issues no generation, pass 0 |
| `id?` | `string` | `WORKING_TREE_ACTIVATION_STATE_ID` | The row primary key, defaulting to the main checkout's row; for a writable checkout pass the result of [activationStateIdOf](activationStateIdOf.md) |

## Returns

`WorkingTreeActivationState`

An unpersisted instance; the caller is responsible for writing it in **one** transaction

## Remarks

Both the new-database path (`createTables()`) and the existing-database path (the `0004` migration) call here through `createWorkingTreeCommitsInitialRows()`, so the two paths' initial values are field-for-field identical. Writing a separate `activationRevision = 0` in each makes any change to one produce two kinds of databases: "newly created" and "upgraded".

`branchGenerationSeq` must **continue from** the issued generation rather than restart at 0: writing 0 makes the next create branch issue generation 1, colliding with the migration's first existing branch, and callers holding the old `(branchId, headRevision)` mis-hit the new branch (ABA).

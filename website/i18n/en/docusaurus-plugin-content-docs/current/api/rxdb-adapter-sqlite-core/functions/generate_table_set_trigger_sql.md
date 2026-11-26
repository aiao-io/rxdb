# generate_table_set_trigger_sql()

```ts
function generate_table_set_trigger_sql(
   adapter, 
   tableSet, 
   branchId, 
   transactionId?
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table/trigger\_sql.ts:285](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts#L285)

Rebuilds only the change triggers of one table set: both the table set and the branch are provided by the caller; branch tables are not touched.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | The SQLite adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Which table set's triggers to rebuild |
| `branchId` | `string` | The branch the triggers write into the change log |
| `transactionId?` | `` `${string}-${string}-${string}-${string}-${string}` `` | The transaction id branded into the triggers; only given for the two rebuilds at the start and end of each logged transaction |

## Returns

`string`

For each entity, `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`; the empty string when this table set has no logged entities

## Remarks

The start and end of every logged transaction, branch switching, after `withTriggersDisabled`, system migrations, and table set creation all go through this one entry (US-314 B1.3).
"Changing the activation state" is split from it: only a real branch switch writes `rxdb_branch` (`version/switch_branch.ts`).

Does not swallow exceptions: a trigger generation failure for any entity must roll back the caller's whole write, otherwise that table would keep accepting writes
in a triggerless state, silently losing history, undo/redo, and sync.

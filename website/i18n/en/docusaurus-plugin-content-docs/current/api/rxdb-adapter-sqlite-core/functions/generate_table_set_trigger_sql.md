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

Rebuilds only one table set's change triggers: both the table set and the branch are provided by the caller, branch tables are untouched.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | SQLite adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Which table set's triggers to rebuild |
| `branchId` | `string` | Branch the triggers write into the change history |
| `transactionId?` | `` `${string}-${string}-${string}-${string}-${string}` `` | Transaction id stamped into the triggers; only given for the two rebuilds at the start and end of each logging transaction |

## Returns

`string`

`DROP TRIGGER IF EXISTS` then `CREATE TRIGGER` for each entity; empty string when no entity in this table set records history

## Remarks

Every logging transaction's start and end, branch switching, after `withTriggersDisabled`, system migration, and table set creation all go through this single entry (US-314 B1.3).
"Changing the activation state" is split out from it: only a real branch switch writes `rxdb_branch` (`version/switch_branch.ts`).

Does not swallow exceptions: if any entity's trigger generation fails, the caller's whole write must roll back, otherwise that table keeps accepting writes
in a trigger-less state, silently losing history, undo/redo, and sync.

# generateNotifyFunctionSQL()

```ts
function generateNotifyFunctionSQL(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/notify\_function\_sql.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/notify_function_sql.ts#L23)

Generates the NOTIFY trigger function SQL

Creates a generic trigger function reusable across multiple tables
The trigger:
1. Collects all changes in the current transaction
2. Sends NOTIFY messages in batch (containing the operation and id arrays)
3. Passes the payload in JSON format

## Returns

`string`

SQL statement that creates the notify_change() function

## Remarks

The function body fetches the row number by the literal `id`, so it only applies to tables whose primary key column is actually named `id`. The adapter only attaches it to the three system tables `rxdb_change` / `rxdb_branch` / `rxdb_migration` (`PGliteClient` likewise only listens on those three channels); business-table changes are written into `rxdb_change` by the change triggers, and business tables whose primary key column was renamed via `columnName` never reach this function.

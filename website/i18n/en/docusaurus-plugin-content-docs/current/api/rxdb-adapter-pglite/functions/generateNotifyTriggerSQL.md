# generateNotifyTriggerSQL()

```ts
function generateNotifyTriggerSQL(tableName): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/notify\_function\_sql.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/notify_function_sql.ts#L73)

Creates a NOTIFY trigger for the specified table

The trigger fires after INSERT, UPDATE, DELETE. The AFTER trigger ensures the change has been committed.

## Parameters

| Parameter   | Type     | Description                                  |
| ----------- | -------- | -------------------------------------------- |
| `tableName` | `string` | Table name (for example "public$RxDBChange") |

## Returns

`string`

SQL statement that creates the trigger (including a table existence check)

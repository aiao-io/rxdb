# removeNotifyTriggerSQL()

```ts
function removeNotifyTriggerSQL(tableName): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/notify\_function\_sql.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/notify_function_sql.ts#L108)

Removes the NOTIFY trigger of a table

## Parameters

| Parameter   | Type     | Description |
| ----------- | -------- | ----------- |
| `tableName` | `string` | Table name  |

## Returns

`string`

SQL statement that drops the trigger

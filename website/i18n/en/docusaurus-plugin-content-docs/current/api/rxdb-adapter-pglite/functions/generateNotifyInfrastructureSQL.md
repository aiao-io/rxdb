# generateNotifyInfrastructureSQL()

```ts
function generateNotifyInfrastructureSQL(watchTables?): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/notify\_function\_sql.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/notify_function_sql.ts#L125)

Generates the complete NOTIFY infrastructure SQL

Includes:
1. Creating the notify_change() function
2. Creating triggers for the monitored tables

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `watchTables?` | `string`[] | Array of table names to monitor (without schema prefix, e.g. 'rxdb_change') |

## Returns

`string`

The complete SQL statement

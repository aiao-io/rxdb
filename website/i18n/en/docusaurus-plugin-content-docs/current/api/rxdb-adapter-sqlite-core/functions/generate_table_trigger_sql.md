# generate_table_trigger_sql()

```ts
function generate_table_trigger_sql(entityMetadata, options): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table/trigger\_sql.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts#L52)

Generates the triggers for a table.

## Parameters

| Parameter        | Type                                                          | Description                         |
| ---------------- | ------------------------------------------------------------- | ----------------------------------- |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | -                                   |
| `options`        | `TriggerOptions`                                              | Trigger options; see TriggerOptions |

## Returns

`string`

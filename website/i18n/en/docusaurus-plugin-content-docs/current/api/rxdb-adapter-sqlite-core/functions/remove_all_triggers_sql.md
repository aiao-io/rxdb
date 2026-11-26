# remove_all_triggers_sql()

```ts
function remove_all_triggers_sql(adapter, tableSet): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table/remove\_trigger\_sql.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table/remove_trigger_sql.ts#L24)

Drops all change triggers of a table set.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | The SQLite adapter |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Which table set's triggers to drop |

## Returns

`string`

`DROP TRIGGER IF EXISTS` statements; the empty string when this table set has no logging entities

## Remarks

Entities are narrowed by table\_set\_logged\_metadata: a shadow table set drops only its own members' triggers and never touches the main table set's.

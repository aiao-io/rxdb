# remove_all_triggers_sql()

```ts
function remove_all_triggers_sql(adapter, tableSet): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/remove\_trigger\_sql.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/remove_trigger_sql.ts#L62)

Generates the SQL that drops all entity triggers

Iterates all entities with logging enabled (log !== false) and generates the SQL that drops their triggers

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `adapter` | [`RxDBAdapterPGlite`](../classes/RxDBAdapterPGlite.md) | PGlite adapter instance |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | - |

## Returns

`string`

SQL statements that drop all triggers (each entity's statements separated by ---STATEMENT_SEPARATOR---)

## Example

```typescript
const sql = remove_all_triggers_sql(adapter);
const statements = sql.split('---STATEMENT_SEPARATOR---');
for (const statement of statements) {
  await adapter.query(statement);
}
```

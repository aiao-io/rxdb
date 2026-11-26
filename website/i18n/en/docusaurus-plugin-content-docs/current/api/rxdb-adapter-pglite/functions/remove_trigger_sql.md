# remove_trigger_sql()

```ts
function remove_trigger_sql(entityMetadata, tableSet): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/remove\_trigger\_sql.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/remove_trigger_sql.ts#L25)

Generates the SQL that drops a single entity's triggers

Generates the SQL statements that drop the trigger and the trigger function for the given entity

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | - |

## Returns

`string`

SQL statements that drop the trigger (containing DROP TRIGGER and DROP FUNCTION)

## Example

```typescript
const metadata = getEntityMetadata(Todo);
const sql = remove_trigger_sql(metadata);
// Returns:
// DROP TRIGGER IF EXISTS "todos_change_trigger" ON "public"."todos"
// ---STATEMENT_SEPARATOR---
// DROP FUNCTION IF EXISTS "public"."todos_change_trigger_fn"() CASCADE
```

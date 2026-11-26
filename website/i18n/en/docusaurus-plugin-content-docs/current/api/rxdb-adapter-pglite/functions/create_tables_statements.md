# create_tables_statements()

```ts
function create_tables_statements<T>(
   adapter, 
   tableSet, 
   EntityTypes, 
   entities?
): Promise<string[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/create\_tables\_sql.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/create_tables_sql.ts#L76)

Generates the list of creation statements for multiple tables

Sorted by **phase**, rather than creating tables and triggers interleaved in input order:
1. `CREATE SCHEMA` (all non-public namespaces)
2. All `CREATE TABLE` and `ADD COLUMN`
3. All indexes and `ADD CONSTRAINT` (foreign keys, range exclusion: must wait until all tables and relation columns exist)
4. All triggers (only for entities with log !== false)
5. Initial data INSERT (optional)

With interleaved generation, foreign keys would point at tables not yet created and triggers would reference a change table not yet created, failing one after another with `schema … does not exist` / `relation … does not exist` on a clean database (PGL-014).

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `adapter` | [`RxDBAdapterPGlite`](../classes/RxDBAdapterPGlite.md) | PGlite adapter instance |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | - |
| `EntityTypes` | `T`[] | Array of entity types |
| `entities?` | `InstanceType`&lt;`T`&gt;[] | Optional array of initial data entities |

## Returns

`Promise`&lt;`string`[]&gt;

Array of SQL statements, each executable individually

## Example

```typescript
for (const statement of await create_tables_statements(adapter, [User, Todo])) {
  await adapter.internalQuery(statement);
}
```

# create_tables_sql()

```ts
function create_tables_sql<T>(
   adapter, 
   tableSet, 
   EntityTypes, 
   entities?
): Promise<string>;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/create\_tables\_sql.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/create_tables_sql.ts#L193)

Generates the creation SQL for multiple tables (a multi-statement string)

It is the concatenated form of [create\_tables\_statements](create_tables_statements.md); statements are separated by semicolons and follow the same order: "all tables → all triggers → initial data".

The return value must go through the **simple query protocol** (multi-statement) and cannot use the single-statement interface of the extended protocol. Previously the return value kept statement separator sentinels, and executing it per the documented example inevitably raised 42601 (PGL-014).

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

`Promise`&lt;`string`&gt;

Semicolon-separated multi-statement SQL

## Example

```typescript
// Multi-statement: must use exec (simple query protocol)
const sql = await create_tables_sql(adapter, [User, Todo]);
await client.exec(sql);

// Use create_tables_statements when executing one by one
```

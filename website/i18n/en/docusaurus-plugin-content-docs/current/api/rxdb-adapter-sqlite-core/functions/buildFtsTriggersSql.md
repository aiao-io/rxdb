# buildFtsTriggersSql()

```ts
function buildFtsTriggersSql(
   table, 
   fields, 
   options?
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts#L69)

Generates the FTS5 sync trigger trio (`_ai` / `_ad` / `_au`).

Business-table changes are synced to `_fts_<table>` through `AFTER INSERT/DELETE/UPDATE` triggers. `StringArrayProperty` fields are expanded into a newline-separated string via a `json_each + group_concat(value, char(10))` subquery and **must not** be written directly as `NEW.<field>`; `NULL` / empty array → empty string.

The UPDATE trigger carries a `WHEN OLD.<f> IS NOT NEW.<f> OR ...` guard: only changes to searchable fields trigger a sync, avoiding the full-field write amplification caused by updates to non-searchable fields (such as counters).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `string` | Business table name |
| `fields` | readonly [`FtsField`](../interfaces/FtsField.md)[] | Field set, exactly consistent with [buildCreateFtsTableSql](buildCreateFtsTableSql.md) |
| `options?` | [`FtsTriggerOptions`](../interfaces/FtsTriggerOptions.md) | Optional write transform; see [FtsTriggerOptions](../interfaces/FtsTriggerOptions.md) |

## Returns

`string`

The SQL string containing 3 `CREATE TRIGGER IF NOT EXISTS` statements

## Throws

When `fields` is empty, or `options.valueWrapper` is not a bare SQL identifier

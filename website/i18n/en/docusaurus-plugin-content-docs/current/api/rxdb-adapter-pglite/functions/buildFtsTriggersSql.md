# buildFtsTriggersSql()

```ts
function buildFtsTriggersSql(
   table, 
   fields, 
   options?
): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts#L83)

Generates the PostgreSQL FTS sync trigger (function + trigger).

Unlike the SQLite FTS5 scheme of three `_ai/_ad/_au` triggers writing into a virtual table, PG uses one `BEFORE INSERT OR UPDATE` trigger that computes the `tsvector` and writes it into the `_fts` column right before the row is written: this saves the extra write of an AFTER trigger and avoids the overhead of delete / virtual-table synchronization.

The returned SQL contains 3 statements (separated by `;`):
1. `CREATE OR REPLACE FUNCTION "<table>__fts_update"()` — computes and writes `NEW."_fts"`
2. `DROP TRIGGER IF EXISTS "<table>__fts_trg" ON "<table>"` — idempotent cleanup
3. `CREATE TRIGGER "<table>__fts_trg" BEFORE INSERT OR UPDATE ON "<table>" FOR EACH ROW EXECUTE FUNCTION "<table>__fts_update"()`

The field set must match the `fields` of [buildCreateFtsTableSql](buildCreateFtsTableSql.md); otherwise missing or extra fields at query time would both distort the ranking.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `string` | Business table name (**without** the schema; the schema goes through [FtsOptions.schema](../interfaces/FtsOptions.md#schema)) |
| `fields` | readonly [`FtsField`](../interfaces/FtsField.md)[] | Fields participating in FTS (order affects the field concatenation order in `concat_ws`, with a slight effect on ranking) |
| `options?` | [`FtsOptions`](../interfaces/FtsOptions.md) | Optional `regconfig` (defaults to [DEFAULT\_FTS\_REGCONFIG](../variables/DEFAULT_FTS_REGCONFIG.md)) and [FtsOptions.schema](../interfaces/FtsOptions.md#schema) |

## Returns

`string`

Multiple SQL statements concatenated (separated by `;`)

## Throws

Thrown when `fields` is empty

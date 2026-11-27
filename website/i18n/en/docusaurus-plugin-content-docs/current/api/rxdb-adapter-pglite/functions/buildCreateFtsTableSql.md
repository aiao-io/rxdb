# buildCreateFtsTableSql()

```ts
function buildCreateFtsTableSql(table, fields, options?): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/create-fts-table.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/create-fts-table.ts#L26)

Generates the DDL for the PostgreSQL FTS physical structure: appends a `_fts` `tsvector` column plus a GIN index on the original table.

The API shape is aligned with `buildCreateFtsTableSql` of `@aiao/rxdb-adapter-sqlite-core/fts5`, but the underlying mechanism is completely different: SQLite FTS5 creates an external-content virtual table `_fts_<table>`, while PG materializes the tsvector column directly on the original table and adds a GIN index — `SELECT ... WHERE _fts @@ plainto_tsquery(...)` hits the index directly, without joining a virtual table.

Returns 2 independent statements (separated by `;`), which the caller may split and execute as needed:

1. `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS "_fts" tsvector`
2. `CREATE INDEX IF NOT EXISTS "<table>__fts_idx" ON <table> USING GIN ("_fts")`

Note: `regconfig` is consumed by [buildFtsTriggersSql](buildFtsTriggersSql.md) inside the trigger function body; the DDL stage does not need to care about it.

## Parameters

| Parameter  | Type                                               | Description                                                                                                                            |
| ---------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `table`    | `string`                                           | Business table name (**without** the schema; the schema goes through [FtsOptions.schema](../interfaces/FtsOptions.md#schema))          |
| `fields`   | readonly [`FtsField`](../interfaces/FtsField.md)[] | Fields participating in the FTS index (order preserved; used by [buildFtsTriggersSql](buildFtsTriggersSql.md) to generate the trigger) |
| `options?` | [`FtsOptions`](../interfaces/FtsOptions.md)        | Optional [FtsOptions.schema](../interfaces/FtsOptions.md#schema); `regconfig` is not consumed at this stage                            |

## Returns

`string`

Multiple SQL statements concatenated (separated by `;`)

## Throws

Thrown when `fields` is empty

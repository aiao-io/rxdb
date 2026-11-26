# buildCreateFtsTableSql()

```ts
function buildCreateFtsTableSql(table, fields): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/create-fts-table.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/create-fts-table.ts#L18)

Generates the FTS5 external content virtual table DDL for a single collection.

Table name convention: `_fts_<table>`; the tokenizer is fixed to `unicode61 remove_diacritics 2`.
Uses SQLite's implicit `rowid` as the external content association key (`content_rowid` defaults to `rowid`):
the business primary key may be either `INTEGER PRIMARY KEY` (a rowid alias) or `TEXT/UUID`; either way
SQLite maintains a stable implicit `rowid`, so triggers and queries consistently associate via `rowid`.
Business primary key values are restored at query time via `JOIN sourceTable src ON src.rowid = fts.rowid`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `string` | Business table name (without the `_fts_` prefix) |
| `fields` | readonly [`FtsField`](../interfaces/FtsField.md)[] | Fields participating in the FTS5 index (order preserved, as the FTS5 column declaration order) |

## Returns

`string`

A single `CREATE VIRTUAL TABLE IF NOT EXISTS` SQL statement

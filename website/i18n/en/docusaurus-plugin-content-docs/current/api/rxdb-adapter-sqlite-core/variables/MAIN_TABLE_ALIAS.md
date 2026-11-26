# MAIN_TABLE_ALIAS

```ts
const MAIN_TABLE_ALIAS: '_';
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L14)

The **leaf** utility module related to table aliases

## Remarks

These constants and formatting functions are used by both `join_sql` (JOIN planning) and `query_sql.utils` (condition compilation).
Since SQLC-010, `query_sql.utils` needs to re-run JOIN planning for EXISTS subqueries;
keeping them in `query_sql.utils` would create a circular dependency `join_sql ⇄ query_sql.utils`.
So they are extracted into a standalone leaf module that depends on no query module.

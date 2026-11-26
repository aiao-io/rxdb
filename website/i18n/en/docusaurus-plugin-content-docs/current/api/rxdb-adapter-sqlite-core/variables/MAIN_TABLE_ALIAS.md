# MAIN_TABLE_ALIAS

```ts
const MAIN_TABLE_ALIAS: '_';
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L14)

**Leaf** utility module for table aliases

## Remarks

These constants and formatting functions are used by both `join_sql` (JOIN planning) and `query_sql.utils` (condition compilation).
Since SQLC-010, `query_sql.utils` needs to re-run JOIN planning for EXISTS subqueries;
if they had stayed in `query_sql.utils`, that would form a circular dependency `join_sql ⇄ query_sql.utils`.
They were therefore extracted into a leaf module that depends on no query module.

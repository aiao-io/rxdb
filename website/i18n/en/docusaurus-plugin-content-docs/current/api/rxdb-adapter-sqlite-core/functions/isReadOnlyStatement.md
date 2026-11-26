# isReadOnlyStatement()

```ts
function isReadOnlyStatement(sql): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts#L48)

Determines whether a statement is read-only (SELECT / EXPLAIN).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |

## Returns

`boolean`

## Remarks

SQLite's `db.changes()` is only meaningful after INSERT/UPDATE/DELETE; calling it on a SELECT yields the count
left over from the **previous write statement**. Returning that number as the SELECT's `rowsAffected` would give callers a number
that has nothing to do with this query (SQLC-030). DML with `RETURNING` does not count as read-only — it really did change rows.

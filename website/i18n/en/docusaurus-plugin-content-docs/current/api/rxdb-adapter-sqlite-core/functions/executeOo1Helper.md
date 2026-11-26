# executeOo1Helper()

```ts
function executeOo1Helper(
   clientName, 
   db, 
   sql, 
   bindings?
): SqliteSuccessResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/execute\_oo1\_helper.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/execute_oo1_helper.ts#L84)

SQL execution helper suitable for any `oo1.DB`-style runtime.

`oo1` = the upstream official SQLite WASM's Object Oriented API v1 (`sqlite3.oo1.DB`),
unrelated to wa-sqlite's C-style execution path.

- When the runtime exposes `prepare()`, uses the prepared statement fast path for single-statement SELECT / EXPLAIN / ... RETURNING ...
- Otherwise falls back to `db.exec()`.

Both `@sqlite.org/sqlite-wasm` and `@sqliteai/sqlite-wasm` expose a synchronous
`oo1.DB.exec()` that handles multi-statement SQL internally, so we collect
`resultRows` and `columnNames` directly from it.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `clientName` | `string` |
| `db` | [`Oo1Database`](../interfaces/Oo1Database.md) |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] |

## Returns

[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)

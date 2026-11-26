# shouldUsePreparedStatementPath()

```ts
function shouldUsePreparedStatementPath(sql): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts#L34)

Determines whether to use the prepared statement path (instead of batch exec).

Returns true only when all conditions are met:

- It is a single statement (contains no `;` after normalization)
- It is a SELECT/EXPLAIN, or DML with a RETURNING clause (a result set is needed)

Multi-statement / plain DML goes through the exec path, avoiding the extra prepare overhead.

## Parameters

| Parameter | Type     |
| --------- | -------- |
| `sql`     | `string` |

## Returns

`boolean`

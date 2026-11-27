# quoteIdentifier()

```ts
function quoteIdentifier(value): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L173)

Wraps an identifier (schema name, table name, column name) in double quotes.

## Parameters

| Parameter | Type     | Description         |
| --------- | -------- | ------------------- |
| `value`   | `string` | The identifier text |

## Returns

`string`

The identifier wrapped in double quotes with inner double quotes doubled

## Throws

RxDBError when the identifier is empty or contains NUL

## Remarks

Directly reuses the core [quoteSqlIdentifier](../../rxdb/functions/quoteSqlIdentifier.md) instead of maintaining a second copy: if two escaping rules ever diverge, what diverges is necessarily **which inputs are rejected** rather than the quoting itself — this adapter's own version previously let empty strings and NUL through unconditionally, while PostgreSQL rejects an entire statement because of one NUL, and the error points at the statement rather than at that value.

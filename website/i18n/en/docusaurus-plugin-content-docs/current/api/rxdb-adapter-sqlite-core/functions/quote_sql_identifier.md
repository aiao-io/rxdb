# quote_sql_identifier()

```ts
function quote_sql_identifier(name): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:526](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L526)

Escapes an identifier (table name, column name, trigger name, etc.) into a double-quoted SQL identifier.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The identifier string |

## Returns

`string`

The double-quoted SQL identifier

## Throws

RxDBError When the identifier is empty or contains NUL

## Remarks

Directly reuses the core's [quoteSqlIdentifier](../../rxdb/functions/quoteSqlIdentifier.md) rather than writing another copy: if the two escaping rules diverge,
what diverges is necessarily **which inputs are rejected**, not the quoting itself — this adapter's copy originally let the empty string and NUL through,
and SQLite **silently truncates** at NUL, producing a syntactically correct statement that targets a different name.

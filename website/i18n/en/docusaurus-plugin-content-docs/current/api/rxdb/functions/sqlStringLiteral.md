# sqlStringLiteral()

```ts
function sqlStringLiteral(value): string;
```

Defined in: [packages/rxdb/src/system/sql-literal.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sql-literal.ts#L64)

Formats a string as an SQL string literal.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The raw string (possibly from a caller, such as a branch ID) |

## Returns

`string`

The literal wrapped in single quotes, with inner single quotes doubled

## Remarks

Doubling single quotes is the SQL-standard escape, complete for both PostgreSQL (`standard_conforming_strings` defaults to
`on` since 9.1, so backslash is no longer an escape character) and SQLite (backslash was never an escape character) — neither side needs,
and neither side **should** apply, any processing of backslashes.

## Throws

[RxDBError](../classes/RxDBError.md) when the value contains NUL: PostgreSQL would reject the whole statement and SQLite would silently truncate it,
  both of which are harder to diagnose than an exception

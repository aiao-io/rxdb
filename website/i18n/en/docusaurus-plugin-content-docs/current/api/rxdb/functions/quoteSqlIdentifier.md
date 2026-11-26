# quoteSqlIdentifier()

```ts
function quoteSqlIdentifier(identifier): string;
```

Defined in: [packages/rxdb/src/system/sql-literal.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sql-literal.ts#L43)

Wraps an identifier (table name, column name) in double quotes.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The raw identifier, usually taken from the entity metadata's `tableName` / `columnName` |

## Returns

`string`

The identifier wrapped in double quotes, with inner double quotes doubled per the SQL standard

## Remarks

Double quotes are the SQL-standard delimited identifier syntax, recognized by both the PostgreSQL and SQLite families. Quoting is not just about injection prevention:
without quotes both sides fold case (PostgreSQL folds to lowercase), while this repository's column names are camelCase like `enabledAt` —
an unquoted CAS would fail to find the column on PGlite.

## Throws

[RxDBError](../classes/RxDBError.md) when the identifier is empty or contains NUL

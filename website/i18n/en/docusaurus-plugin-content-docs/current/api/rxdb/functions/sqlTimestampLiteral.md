# sqlTimestampLiteral()

```ts
function sqlTimestampLiteral(value): string;
```

Defined in: [packages/rxdb/src/system/sql-literal.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sql-literal.ts#L116)

Formats a moment in time as an SQL string literal (ISO 8601, UTC).

## Parameters

| Parameter | Type   | Description        |
| --------- | ------ | ------------------ |
| `value`   | `Date` | The moment in time |

## Returns

`string`

The ISO 8601 string literal

## Remarks

Consistent with the date column storage shape on both sides: PGlite's `timestamptz` accepts ISO text through assignment casts,
and the SQLite family already stores `PropertyType.date` as ISO TEXT.

## Throws

[RxDBError](../classes/RxDBError.md) when the value is an Invalid Date — it would format the string `'Invalid Date'`,
which lands silently in SQLite and only explodes at execution time on PGlite

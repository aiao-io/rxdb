# normalizeSingleStatementSql()

```ts
function normalizeSingleStatementSql(sql): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts#L16)

Strips the trailing semicolon and whitespace, to make it easier to decide whether this is a single statement.

## Parameters

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `sql`     | `string` | Raw SQL string |

## Returns

`string`

SQL without trailing semicolons or whitespace

## Remarks

The trailing semicolon is stripped with a linear scan instead of `replace(/;+\s*$/u, '')`: with the latter, when there is content after the semicolon run
(`'a' + ';'.repeat(30000) + 'b'`), every start position must eat the whole run and then back off one by one, making it O(n²) overall (CS-004).
Semantics are unchanged — after `trim()` the `\s*$` can only match an empty string, so the regex really only strips "trailing consecutive semicolons",
and semicolons separated by whitespace (`'select 1; ;'`) are kept by both approaches.

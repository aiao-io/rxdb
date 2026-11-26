# normalizeSingleStatementSql()

```ts
function normalizeSingleStatementSql(sql): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts#L16)

Strips the trailing semicolon and whitespace, to make it easier to judge later whether it is a single statement.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The raw SQL string |

## Returns

`string`

The SQL without trailing semicolons or whitespace

## Remarks

The trailing semicolons are stripped by a linear scan rather than `replace(/;+\s*$/u, '')`: the latter, when content follows the semicolon run
(`'a' + ';'.repeat(30000) + 'b'`), makes every starting position consume the whole run and backtrack one by one, O(n²) overall (CS-004).
The semantics are unchanged — after `trim()`, `\s*$` can only match the empty string, so the regex actually only strips "trailing consecutive semicolons";
semicolons separated by whitespace (`'select 1; ;'`) are preserved by both styles.

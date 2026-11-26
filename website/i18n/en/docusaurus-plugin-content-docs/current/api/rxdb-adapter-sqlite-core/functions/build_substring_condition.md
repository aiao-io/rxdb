# build_substring_condition()

```ts
function build_substring_condition(fieldSql, operator, value): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L447)

Generates the SQL condition for substring-like operators

## Parameters

| Parameter  | Type      | Description                      |
| ---------- | --------- | -------------------------------- |
| `fieldSql` | `string`  | The already-qualified column SQL |
| `operator` | `string`  | The substring-like operator      |
| `value`    | `unknown` | The rule value                   |

## Returns

`string`

The SQL condition string

## Remarks

Does not use `LIKE`: SQLite's `LIKE` treats `%` `_` in the value as wildcards and is case-insensitive for ASCII,
contradicting the JS incremental match of `String.includes` / `startsWith` / `endsWith` — with the same data,
a row matches the first SQL query but the incremental match after a write does not, and the reactive query drifts on its own (SQLC-007).
`instr` / `substr` use binary comparison, naturally "literal + case-sensitive", so no `ESCAPE` clause is needed either.

The empty-string edge cases match JS: `instr(X, '')` returns 1, `substr(X, length(X) + 1)` returns `''`,
corresponding to `includes('')` / `startsWith('')` / `endsWith('')` always being true.

Everything produced is a single comparison expression, which binds tighter than AND/OR, so it needs no parentheses of its own
(compare the two-part condition of [handle\_array\_in](handle_array_in.md)).

## Throws

When the operator is not substring-like

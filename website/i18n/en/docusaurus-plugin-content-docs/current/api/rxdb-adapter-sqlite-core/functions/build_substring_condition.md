# build_substring_condition()

```ts
function build_substring_condition(
   fieldSql, 
   operator, 
   value
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L447)

Generates the SQL condition for substring-like operators

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fieldSql` | `string` | Qualified column SQL |
| `operator` | `string` | Substring-like operator |
| `value` | `unknown` | Rule value |

## Returns

`string`

SQL condition string

## Remarks

Does not use `LIKE`: SQLite's `LIKE` treats `%` `_` in the value as wildcards and is ASCII case-insensitive,
contradicting JS incremental matching's `String.includes` / `startsWith` / `endsWith` — the same data
hits on the first SQL query but misses on the incremental match after a write, and the reactive query drifts on its own (SQLC-007).
`instr` / `substr` use binary comparison, which is naturally "literal + case-sensitive", so no `ESCAPE` clause is needed.

Empty string boundaries match JS: `instr(X, '')` returns 1 and `substr(X, length(X) + 1)` returns `''`,
corresponding to `includes('')` / `startsWith('')` / `endsWith('')` being always true.

The output is always a single comparison expression with higher precedence than AND/OR, so it needs no parentheses of its own
(compare the two-part condition of [handle\_array\_in](handle_array_in.md)).

## Throws

When the operator is not substring-like

# buildFieldContainsSql()

```ts
function buildFieldContainsSql(opts): string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L148)

Single-field contains fallback SQL.

When the collection's FTS5 full-word / prefix-word hits are **all zero**, this degrades to an `instr(lower(...), lower(?))` infix match on the source table, covering the case where `including` is hit by a query for `ncluding`.

Semantic boundary (deliberate, not a defect): this is a "lenient fallback on a global miss" and **does not promise complete infix recall** — as long as any field of the same collection has an FTS hit, contains is not executed (records that could only be hit by infix will not appear). If it always ran, every field of every query would pay an unindexed `instr` full-table scan, which is unacceptable on large tables. The fallback's sort weight is deliberately inferior to FTS results (rank base 1000000 + prefix_penalty 2).

Parameter order (named-positional `?N`):
 - `?1` = `field` (the hit column name literal)
 - `?2 .. ?(tokenCount + 1)` = tokens (each shared by rank/where)
 - `?(tokenCount + 2)` = snippetLength
 - `?(tokenCount + 3)` = limit
 - `?(tokenCount + 4)` = offset

## Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | \{ `field`: `string`; `fieldIsArray?`: `boolean`; `primaryKey`: `string`; `sqlTable?`: `string`; `table`: `string`; `tokenCount`: `number`; \} |
| `opts.field` | `string` |
| `opts.fieldIsArray?` | `boolean` |
| `opts.primaryKey` | `string` |
| `opts.sqlTable?` | `string` |
| `opts.table` | `string` |
| `opts.tokenCount` | `number` |

## Returns

`string`

# buildFieldSearchSql()

```ts
function buildFieldSearchSql(opts): string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L104)

Single-field search SQL.

Parameter order (unnamed `?`):

1.  `field` — hit column name (written back into results only as a string literal; not part of SQL parsing)
2.  `snippetLength` — token window limit of the FTS5 snippet
3.  `matchExpr` — FTS5 MATCH expression
4.  `limit`
5.  `offset`

## Parameters

| Parameter         | Type                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `opts`            | \{ `field`: `string`; `fieldIndex`: `number`; `primaryKey`: `string`; `sqlTable?`: `string`; `table`: `string`; \} |
| `opts.field`      | `string`                                                                                                           |
| `opts.fieldIndex` | `number`                                                                                                           |
| `opts.primaryKey` | `string`                                                                                                           |
| `opts.sqlTable?`  | `string`                                                                                                           |
| `opts.table`      | `string`                                                                                                           |

## Returns

`string`

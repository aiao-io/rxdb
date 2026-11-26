# handle_array_in()

```ts
function handle_array_in(
   entityMetadata, 
   originalField, 
   rule, 
   tableAlias?
): string | null;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:530](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L530)

Handles in/notIn queries on array fields

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | `undefined` | - |
| `originalField` | `string` | `undefined` | - |
| `rule` | `QueryRuleValue` | `undefined` | - |
| `tableAlias?` | `string` | `MAIN_TABLE_ALIAS` | The alias of the table the column lives on: inside an EXISTS subquery it is the subquery root table, not the top-level main table `_` |

## Returns

`string` \| `null`

## Remarks

The notIn branch must explicitly exclude NULL rows (SQLC-008). The negation operators of scalar columns exclude
NULL naturally through SQL's three-valued logic, and JS incremental matching accordingly classifies notIn into `NULL_EXCLUDED_OPERATORS`, returning false directly
(see the design contract in `packages/rxdb/src/query/query-matching.utils.ts`). But `json_each()`
produces no rows for a NULL column, so a bare `NOT EXISTS(...)` is always true — array columns thus become the only exception that keeps NULL rows,
and the same row has opposite conclusions between the first SQL query and the incremental match after a write, so the reactive query drifts on its own.

The generated two-part condition carries its own parentheses: `buildRuleGroup` does not add parentheses for a single rule,
otherwise `a OR tags notIn [...]` would be silently rewritten by AND's precedence into `(a OR tags IS NOT NULL) AND ...`.
The in branch needs no guard: `EXISTS(...)` is already false for a NULL column.

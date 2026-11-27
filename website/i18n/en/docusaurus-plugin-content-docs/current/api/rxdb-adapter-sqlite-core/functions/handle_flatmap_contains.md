# handle_flatmap_contains()

```ts
function handle_flatmap_contains(entityMetadata, originalField, rule, tableAlias?): string | null;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:487](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L487)

Handles contains/notContains queries on keyValue fields.

## Parameters

| Parameter        | Type                                                          | Default value      | Description                                                                                                                       |
| ---------------- | ------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | `undefined`        | -                                                                                                                                 |
| `originalField`  | `string`                                                      | `undefined`        | -                                                                                                                                 |
| `rule`           | `QueryRuleValue`                                              | `undefined`        | -                                                                                                                                 |
| `tableAlias?`    | `string`                                                      | `MAIN_TABLE_ALIAS` | Alias of the table containing the column: in an EXISTS subquery this is the subquery root table, not the top-level main table `_` |

## Returns

`string` \| `null`

## Remarks

**Known limitation**: the current implementation assumes dots are used only as nested path separators. If a key inside the keyValue object itself contains a dot, this method will not work correctly. See the documentation of `_try_process_top_level_flatmap` in query_sql.ts for details.

Returning `null` means "this rule is not handled by this function" (handed back to the generic substring path), which is different from "matches the empty set" — the latter must return an always-true/always-false constant. It once returned `''` when all entries were empty: `build_substring_rule` only treats `null` as "not mine", so the empty string was carried through verbatim and then dropped by `.filter(Boolean)` in `buildRuleGroup`, turning a `contains` filter that should have narrowed the results into the whole table.

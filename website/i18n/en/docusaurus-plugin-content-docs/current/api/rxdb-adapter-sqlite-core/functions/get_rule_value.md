# get_rule_value()

```ts
function get_rule_value(rule): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:323](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L323)

Gets the SQL representation of a rule value.

## Parameters

| Parameter | Type             | Description     |
| --------- | ---------------- | --------------- |
| `rule`    | `QueryRuleValue` | The rule object |

## Returns

`string`

The SQL value string

## Remarks

Substring operators do not build their pattern strings here — their values are returned verbatim as literals; `%` and `_` are treated as ordinary characters by [build\_substring\_condition](build_substring_condition.md) (SQLC-007).

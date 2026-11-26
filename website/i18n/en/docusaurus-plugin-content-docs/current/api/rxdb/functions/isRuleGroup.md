# isRuleGroup()

```ts
function isRuleGroup(value): value is RuntimeRuleGroup;
```

Defined in: [packages/rxdb/src/query/query-matching.utils.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/query-matching.utils.ts#L52)

Determines whether a value is a RuleGroup.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

`value is RuntimeRuleGroup`

Returns true if it is a RuleGroup, otherwise false

## Remarks

**Shallow** judgment: only validates this level's `combinator` and `rules`, does not recurse into the elements of `rules`.
This level must validate completely — the `RuntimeRuleGroup` asserted by the predicate requires `combinator` to be only
`'and' | 'or'` and `rules` to be an array; if the predicate were wider than the assertion, downstream code would access
nonexistent members on a value the type system says "already validated" (`whereUsesRelations`'s
`for (const rule of rg.rules)` would throw a `TypeError` outright).

Scenarios that need every element of `rules` validated as well (`where` coming from arbitrary caller-supplied values,
with nothing else vouching for it) use the deep validation version inside `QueryTask`, which starts with this function as its first step.

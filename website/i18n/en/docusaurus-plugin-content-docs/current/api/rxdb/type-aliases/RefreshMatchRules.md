# RefreshMatchRules

```ts
type RefreshMatchRules = RefreshMatchRuleName[][];
```

Defined in: [packages/rxdb/src/repository/QueryManager.interface.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.interface.ts#L123)

Refresh match rules
The two-dimensional array represents a combination of multiple rule groups; conditions within each group are ANDed,
and groups are ORed with each other
For example: `[['match_where', 'result_contains'], ['not_match_where']]`
means: (matches query condition AND result contains) OR (does not match query condition)

# TREE_QUERY_TYPE_LIST

```ts
const TREE_QUERY_TYPE_LIST: readonly ['findDescendants', 'findAncestors', 'countDescendants', 'countAncestors'];
```

Defined in: [rxdb-plugin-tree/src/constants.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/constants.ts#L19)

The **single source** of tree query task types.

## Remarks

These four names are consumed in three places: the `type` field of the `*Query` interfaces (the type side), [TREE\_QUERY\_TYPES](TREE_QUERY_TYPES.md) (the first filter of the three merges), and `TreeRepository._STATIC_METHODS` (the static method names attached to entities). They used to each keep their own copy; missing one of them when adding a fifth tree query **would not error** — the new task would just silently fall back to the core default merge, or never get attached to entities at all.

Now the latter two derive from here, the interface side binds to it with `Extract<TreeQueryType, …>`, and the bidirectional consistency is pinned at compile time by `__tests__/contracts/tree-query-type-parity.spec.ts`.

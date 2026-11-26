# resolveSearchScope()

```ts
function resolveSearchScope(__namedParameters): readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/core/scope-resolver.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/scope-resolver.ts#L32)

Computes the final list of collection names that participate in search aggregation (same order as `candidates`, deduplicated).

Semantics:

- `excludedCollections` always takes effect first (plugin-level hard exclusion)
- `requested` can only narrow further (intersected with the set remaining after `excluded`)
- If `requested` contains names that don't exist in `candidates`, throws and lists all unknown names (fail-fast: a typo must surface, not masquerade as "no search results")
- If `requested` is non-empty but the resolved scope is empty (all excluded), throws as well
- The returned result is read-only for the caller

## Parameters

| Parameter           | Type                                                      |
| ------------------- | --------------------------------------------------------- |
| `__namedParameters` | [`ResolveScopeInput`](../interfaces/ResolveScopeInput.md) |

## Returns

readonly `string`[]

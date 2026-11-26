# ResolveScopeInput

Defined in: [packages/rxdb-plugin-search/src/core/scope-resolver.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/scope-resolver.ts#L13)

Resolves the collection scope participating in aggregation.

Priority (top-down, intersecting level by level):
1. `candidates`: the set of collection names that have `searchable` fields (already schema-validated)
2. `excludedCollections`: plugin-level global exclusion ([SearchPluginOptions.excludedCollections](SearchPluginOptions.md#excludedcollections))
3. `requested`: the explicit allowlist of a single call's [SearchOptions.collections](SearchOptions.md#collections); when not passed, equivalent to 1∩2

This function is pure logic (no side effects, no DB access), which makes it easy to cover with unit tests and reuse at runtime.

## Properties

### candidates \{#candidates\}

```ts
readonly candidates: readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/core/scope-resolver.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/scope-resolver.ts#L14)

***

### excludedCollections? \{#excludedcollections\}

```ts
readonly excludedCollections?: readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/core/scope-resolver.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/scope-resolver.ts#L15)

***

### requested? \{#requested\}

```ts
readonly requested?: readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/core/scope-resolver.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/scope-resolver.ts#L16)

# TREE_QUERY_TYPES

```ts
const TREE_QUERY_TYPES: ReadonlySet<string>;
```

Defined in: [rxdb-plugin-tree/src/constants.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/constants.ts#L37)

Set of tree query task types

## Remarks

The three merge functions use it as the first filter: when `TreeRepository` registers itself with the `QueryManager`, it registers per task type, but the same Repository also runs generic queries like `findAll` / `count`, which must fall back to the core's default merge untouched. Without this check, the tree incremental logic would take over non-tree tasks.

The element type is declared as `string` rather than [TreeQueryType](../type-aliases/TreeQueryType.md): callers pass in `QueryTask.type` (a `string`), and narrowing to the union would make `has()` fail to compile at call sites.

# EdgeFilterOptions

```ts
type EdgeFilterOptions = object;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L36)

Base interface for edge filter conditions (no weight, no properties)

## Remarks

The current version does not support complex queries yet; only simple key-value matching
For complex queries, use SQL directly against the edge table (\{EntityName\}_edges)

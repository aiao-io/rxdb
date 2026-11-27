# GRAPH_ENTITY_BASE_OPTIONS

```ts
const GRAPH_ENTITY_BASE_OPTIONS: EntityMetadataOptions;
```

Defined in: [rxdb-plugin-graph/src/constants.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/constants.ts#L15)

Metadata options of the graph entity base class

## Remarks

Living in this zero-dependency module is what lets the `/generator` subpath read it without importing [GraphEntityBase](../classes/GraphEntityBase.md) — the latter would evaluate decorators and rxjs along with it, while the generator only runs at build time.

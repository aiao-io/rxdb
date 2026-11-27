# GraphEntity()

```ts
function GraphEntity(metadataOptions): <T>(target) => T;
```

Defined in: [rxdb-plugin-graph/src/@GraphEntity.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/@GraphEntity.ts#L12)

Graph entity decorator
Marks a class as a graph structure entity, handles graph-specific metadata, generates the edges table, etc.

## Parameters

| Parameter         | Type                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| `metadataOptions` | [`EntityMetadataOptions`](../../rxdb/interfaces/EntityMetadataOptions.md) |

## Returns

&lt;`T`&gt;(`target`) => `T`

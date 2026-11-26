# useGraphNeighbors()

```ts
function useGraphNeighbors<T>(EntityType, options): RxDBResource<GraphQueryResult<NeighborResult<T, EdgeInfo>>>;
```

Defined in: [rxdb-react/src/hooks.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L279)

Finds the neighbors of a graph entity.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Graph entity type. |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findNeighborsOptions"`&gt;&gt; | Neighbor query options or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`NeighborResult`](../interfaces/NeighborResult.md)&lt;`T`, [`EdgeInfo`](../../rxdb-plugin-graph/interfaces/EdgeInfo.md)&gt;&gt;&gt;

A query resource of the neighbor entity array.

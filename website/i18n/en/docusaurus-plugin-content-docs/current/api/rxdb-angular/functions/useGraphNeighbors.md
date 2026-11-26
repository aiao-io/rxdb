# useGraphNeighbors()

```ts
function useGraphNeighbors<T>(EntityType, options): RxDBResource<GraphQueryResult<NeighborResult<T, EdgeInfo>>>;
```

Defined in: [rxdb-angular/src/hooks.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L259)

Finds adjacent entities in a graph structure

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity class |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findNeighborsOptions"`&gt;&gt; | Graph query parameters (entityId, direction, level, etc.) |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`NeighborResult`](../interfaces/NeighborResult.md)&lt;`T`, [`EdgeInfo`](../../rxdb-plugin-graph/interfaces/EdgeInfo.md)&gt;&gt;&gt;

Resource signal containing the neighbor entities

## Example

```typescript
const friends = useGraphNeighbors(User, {
  entityId: 'user-1',
  direction: 'out',
  level: 1
});
```

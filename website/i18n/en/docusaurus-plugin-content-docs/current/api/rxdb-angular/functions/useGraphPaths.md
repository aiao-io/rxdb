# useGraphPaths()

```ts
function useGraphPaths<T>(EntityType, options): RxDBResource<GraphQueryResult<GraphPath<T>>>;
```

Defined in: [rxdb-angular/src/hooks.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L299)

Finds paths between two entities in a graph structure

## Type Parameters

| Type Parameter                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                    | Description                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `EntityType` | `T`                                                                                                                                                     | Entity class                                              |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findPathsOptions"`&gt;&gt; | Path query parameters (fromId, toId, maximum depth, etc.) |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`GraphPath`](../interfaces/GraphPath.md)&lt;`T`&gt;&gt;&gt;

Resource signal containing the paths

## Example

```typescript
const paths = useGraphPaths(User, {
  fromId: 'user-1',
  toId: 'user-2',
  maxDepth: 5
});
```

# useGraphPaths()

```ts
function useGraphPaths<T>(EntityType, options): RxDBResource<GraphQueryResult<GraphPath<T>>>;
```

Defined in: [rxdb-vue/src/hooks.ts:439](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L439)

Finds the paths between two entities in a graph

## Type Parameters

| Type Parameter                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                    | Description                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `EntityType` | `T`                                                                                                                                                     | Entity class                                      |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findPathsOptions"`&gt;&gt; | Path query options (fromId, toId, maxDepth, etc.) |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`GraphPath`](../interfaces/GraphPath.md)&lt;`T`&gt;&gt;&gt;

A reactive resource object containing the paths

## Example

```typescript
// Hold it as a whole: the resource is a reactive object; destructuring gives a one-time snapshot (see RxDBResource)
const paths = useGraphPaths(User, {
  fromId: 'user-1',
  toId: 'user-2',
  maxDepth: 5
});
// In templates use paths.value / paths.isLoading
```

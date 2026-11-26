# useGraphPaths()

```ts
function useGraphPaths<T>(EntityType, options): RxDBResource<GraphQueryResult<GraphPath<T>>>;
```

Defined in: [rxdb-react/src/hooks.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L310)

Finds the paths between graph entities.

## Type Parameters

| Type Parameter                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                    | Description                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `EntityType` | `T`                                                                                                                                                     | Graph entity type.                           |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findPathsOptions"`&gt;&gt; | Path query options or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`GraphPath`](../interfaces/GraphPath.md)&lt;`T`&gt;&gt;&gt;

A query resource of the path result array.

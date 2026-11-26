# useCountNeighbors()

```ts
function useCountNeighbors<T>(EntityType, options): RxDBResource<number>;
```

Defined in: [rxdb-react/src/hooks.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L297)

Counts the neighbors of a graph entity.

## Type Parameters

| Type Parameter                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                        | Description                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `EntityType` | `T`                                                                                                                                                         | Graph entity type.                               |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findNeighborsOptions"`&gt;&gt; | Neighbor query options or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`number`&gt;

A count resource with `0` as the initial value.

# useCountNeighbors()

```ts
function useCountNeighbors<T>(EntityType, options): RxDBResource<number>;
```

Defined in: [rxdb-angular/src/hooks.ts:277](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L277)

Counts adjacency in a graph structure

## Type Parameters

| Type Parameter                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`GraphEntityType`](../../rxdb-plugin-graph/type-aliases/GraphEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                        | Description            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `EntityType` | `T`                                                                                                                                                         | Entity class           |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findNeighborsOptions"`&gt;&gt; | Graph query parameters |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`number`&gt;

Resource signal containing the count

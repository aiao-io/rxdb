# useInfiniteScroll()

```ts
function useInfiniteScroll<T>(EntityType, options): InfiniteScrollResource<InstanceType<T>>;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L106)

Provides infinite-scroll state backed by RxDB cursor queries.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityType` | `T`                                                                                                                                                        |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findByCursorOptions"`&gt;&gt; |

## Returns

[`InfiniteScrollResource`](../interfaces/InfiniteScrollResource.md)&lt;`InstanceType`&lt;`T`&gt;&gt;

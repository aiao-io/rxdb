# useInfiniteScroll()

```ts
function useInfiniteScroll<T>(EntityType, options): InfiniteScrollResource<InstanceType<T>>;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L134)

Infinite scroll hook for cursor pagination.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                       | Description                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `EntityType` | `T`                                                                                                                                                        | Entity class.                                                           |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findByCursorOptions"`&gt;&gt; | Query options with cursor pagination, a reactive reference or a getter. |

## Returns

[`InfiniteScrollResource`](../interfaces/InfiniteScrollResource.md)&lt;`InstanceType`&lt;`T`&gt;&gt;

Infinite scroll data and control state.

## Throws

Thrown during setup when there is no `provideRxDB()` in the component tree.

## Throws

Thrown while computing the content key when options contain non-serializable values (functions, `Symbol`s, non-cursor class instances). Cursor entities themselves are legal; see [createQueryOptionsKey](../../utils/functions/createQueryOptionsKey.md).

## Remarks

The first page is emitted inside `onMounted`; calling `loadMore()` during setup is a no-op — no query is made under SSR, and loading proceeds normally after client hydration. Options are compared by content: a structurally equivalent new reference does not trigger a reload; only when some field really changed does it restart from the first page.

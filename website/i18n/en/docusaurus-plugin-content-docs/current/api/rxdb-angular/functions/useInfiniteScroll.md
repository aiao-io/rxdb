# useInfiniteScroll()

```ts
function useInfiniteScroll<T>(EntityType, options): InfiniteScrollResource<InstanceType<T>>;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L50)

Creates an infinite scroll resource from the current Angular injection context.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity constructor |
| `options` | [`InfiniteScrollOptions`](../type-aliases/InfiniteScrollOptions.md)&lt;`T`&gt; | Cursor pagination options (`limit` / `orderBy` / `where`, etc.) |

## Returns

[`InfiniteScrollResource`](../interfaces/InfiniteScrollResource.md)&lt;`InstanceType`&lt;`T`&gt;&gt;

An [InfiniteScrollResource](../interfaces/InfiniteScrollResource.md) released automatically with the injection context

## Remarks

**Must be called in an injection context** (inside a component/directive constructor or `runInInjectionContext`) — it registers a destruction hook via `inject(DestroyRef)` and unsubscribes automatically when the host is destroyed; callers need no manual cleanup.

# createSearchHandle()

```ts
function createSearchHandle(opts): SearchHandle;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L83)

Assembles a [SearchHandle](../interfaces/SearchHandle.md). Callers only need to care about the state stream and lifecycle management.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`CreateSearchHandleOptions`](../interfaces/CreateSearchHandleOptions.md) |

## Returns

[`SearchHandle`](../interfaces/SearchHandle.md)

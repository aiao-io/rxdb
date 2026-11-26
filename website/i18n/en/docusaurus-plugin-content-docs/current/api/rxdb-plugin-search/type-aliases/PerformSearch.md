# PerformSearch

```ts
type PerformSearch = (query, page, signal?) => Promise<SearchPage>;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L44)

The "actual work" function injected by plugin.ts: given a query term and a page number, returns the results for that page.

Page numbers are 0-based; empty queries are filtered out by the handle before invocation, so this function never receives an empty string.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `page` | `number` |
| `signal?` | `AbortSignal` |

## Returns

`Promise`&lt;[`SearchPage`](../interfaces/SearchPage.md)&gt;

# SearchEngine

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L75)

The engine handle returned by `createSearchEngine(...)`.

## Methods

### search() \{#search\}

```ts
search(query): Promise<ResultWithPenalty[]>;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L77)

Executes a search on a single collection and returns results with `_prefixPenalty` for further processing by the aggregator.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | [`SearchEngineQuery`](SearchEngineQuery.md) |

#### Returns

`Promise`&lt;`ResultWithPenalty`[]&gt;

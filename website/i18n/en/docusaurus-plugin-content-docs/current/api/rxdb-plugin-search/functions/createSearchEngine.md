# createSearchEngine()

```ts
function createSearchEngine(executor): SearchEngine;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L201)

Constructs a `SearchEngine` bound to a SQL executor.

## Parameters

| Parameter  | Type                                            |
| ---------- | ----------------------------------------------- |
| `executor` | [`FtsExecutor`](../type-aliases/FtsExecutor.md) |

## Returns

[`SearchEngine`](../interfaces/SearchEngine.md)

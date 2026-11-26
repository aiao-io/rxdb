# BoardSearchUpstream

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L41)

Upstream full-text source: a single-collection query that returns all hits (plugin instance or test double).

## Methods

### searchCollection() \{#searchcollection\}

```ts
searchCollection(
   collection,
   query,
   options?
): SearchHandle;
```

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L42)

#### Parameters

| Parameter    | Type                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `collection` | `string`                                                                |
| `query`      | `string`                                                                |
| `options?`   | [`SearchOptions`](../../rxdb-plugin-search/interfaces/SearchOptions.md) |

#### Returns

[`SearchHandle`](SearchHandle.md)

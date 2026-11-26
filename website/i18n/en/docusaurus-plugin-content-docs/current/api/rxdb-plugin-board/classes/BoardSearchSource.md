# BoardSearchSource

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L79)

Board-level search source: conforms to [SearchSourceLike](../../rxdb-plugin-search/interfaces/SearchSourceLike.md); all three framework bindings consume the same implementation.
The upstream full-text source is injected by the host (plugin instance); when it is not installed or the adapter does not support it,
the host disables the entry (US-538 AC#5); this class performs no capability pre-check before `search()`.

## Implements

- [`SearchSourceLike`](../../rxdb-plugin-search/interfaces/SearchSourceLike.md)

## Constructors

### Constructor

```ts
new BoardSearchSource(
   rxdb, 
   ctx, 
   upstream, 
   options?
): BoardSearchSource;
```

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L80)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `ctx` | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |
| `upstream` | [`BoardSearchUpstream`](../interfaces/BoardSearchUpstream.md) |
| `options?` | [`BoardSearchSourceOptions`](../interfaces/BoardSearchSourceOptions.md) |

#### Returns

`BoardSearchSource`

## Methods

### search() \{#search\}

```ts
search(query): SearchHandle;
```

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L87)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |

#### Returns

[`SearchHandle`](../interfaces/SearchHandle.md)

#### Implementation of

[`SearchSourceLike`](../../rxdb-plugin-search/interfaces/SearchSourceLike.md).[`search`](../../rxdb-plugin-search/interfaces/SearchSourceLike.md#search)

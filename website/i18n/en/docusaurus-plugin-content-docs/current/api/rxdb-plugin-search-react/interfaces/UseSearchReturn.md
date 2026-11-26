# UseSearchReturn

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L31)

Return value of [useSearch](../functions/useSearch.md).

## Properties

### clear \{#clear\}

```ts
clear: () => void;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L47)

Clears the query and results and returns to idle

#### Returns

`void`

***

### error \{#error\}

```ts
error: 
  | SearchExecutionError
  | undefined;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L41)

The most recent execution error

***

### hasMore \{#hasmore\}

```ts
hasMore: boolean;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L43)

Whether there is another page

***

### loadMore \{#loadmore\}

```ts
loadMore: () => Promise<void>;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L45)

Loads the next page; no-op when there is no more

#### Returns

`Promise`&lt;`void`&gt;

***

### query \{#query\}

```ts
query: string;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L33)

The current query term

***

### results \{#results\}

```ts
results: readonly SearchResult[];
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L37)

The current results

***

### retry \{#retry\}

```ts
retry: () => void;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L49)

Retries in the error state

#### Returns

`void`

***

### setQuery \{#setquery\}

```ts
setQuery: (q) => void;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L35)

Writes the query term; triggers the plugin debounce

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | `string` |

#### Returns

`void`

***

### state \{#state\}

```ts
state: SearchState;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L39)

The current state

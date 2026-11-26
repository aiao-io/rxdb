# SearchHandle

Defined in: [packages/rxdb-plugin-search/src/types.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L83)

The reactive handle returned by `collection.search()` / `rxDB.search()`.

Subscribing to `results$` triggers the query pipeline; calling [SearchHandle.destroy](#destroy) releases all internal subscriptions. Framework bindings (Angular / React / Vue) call `destroy()` automatically at the end of the lifecycle.

## Properties

### error$ \{#error\}

```ts
readonly error$: Observable<
  | SearchExecutionError
  | undefined>;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L89)

The most recent execution error; empty queries and empty-after-normalization are not treated as errors

***

### hasMore$ \{#hasmore\}

```ts
readonly hasMore$: Observable<boolean>;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L91)

Whether there is another page of results to load

***

### results$ \{#results\}

```ts
readonly results$: Observable<readonly Readonly<SearchResult>[]>;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L85)

Reactive read-only snapshot; the array and its elements are frozen at runtime

***

### state$ \{#state\}

```ts
readonly state$: Observable<SearchState>;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L87)

Current state (for reading in non-framework scenarios)

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L97)

Clears the query term, returns to `idle`, clears results / error / pagination

#### Returns

`void`

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L101)

Unsubscribes and releases resources (called automatically by the framework layer)

#### Returns

`void`

***

### loadMore() \{#loadmore\}

```ts
loadMore(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L95)

Loads the next page; no-op when there is no more data

#### Returns

`Promise`&lt;`void`&gt;

***

### retry() \{#retry\}

```ts
retry(): void;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L99)

Re-triggers with the last query term while in the `error` state

#### Returns

`void`

***

### setQuery() \{#setquery\}

```ts
setQuery(query): void;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L93)

Updates the query term (triggers debounce)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |

#### Returns

`void`

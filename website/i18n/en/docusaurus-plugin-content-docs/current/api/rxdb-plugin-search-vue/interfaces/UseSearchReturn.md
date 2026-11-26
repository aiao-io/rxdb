# UseSearchReturn

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L72)

Return value of [useSearch](../functions/useSearch.md).

## Properties

### clear \{#clear\}

```ts
clear: () => void;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L93)

Clears the query and returns to idle

#### Returns

`void`

***

### error \{#error\}

```ts
error: Readonly<Ref<
  | SearchExecutionError
  | undefined>>;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L87)

The most recent execution error (read-only).

***

### hasMore \{#hasmore\}

```ts
hasMore: Readonly<Ref<boolean>>;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L89)

Whether there is another page (read-only).

***

### loadMore \{#loadmore\}

```ts
loadMore: () => Promise<void>;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L91)

Loads the next page; no-op when there is no more

#### Returns

`Promise`&lt;`void`&gt;

***

### query \{#query\}

```ts
query: Ref<string>;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L74)

Readable/writable query term; supports `v-model` and direct assignment. This is the **only** writable output.

***

### results \{#results\}

```ts
results: Readonly<Ref<readonly SearchResult[]>>;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L83)

The current results.

#### Remarks

SRCHV-003: the four handle-driven outputs are all read-only. Earlier the internal writable `Ref` was returned as-is,
allowing callers to forge `idle` as `error`, which permanently diverged the UI from the real handle
before the next Observable emission. Angular uses read-only `Signal`s and React only returns values; this aligns with that.

***

### retry \{#retry\}

```ts
retry: () => void;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L95)

Retries with the last query term in the error state

#### Returns

`void`

***

### state \{#state\}

```ts
state: Readonly<Ref<SearchState>>;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L85)

The current state (read-only, see [UseSearchReturn.results](#results)).

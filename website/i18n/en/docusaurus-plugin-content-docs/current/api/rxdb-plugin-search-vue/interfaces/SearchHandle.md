# SearchHandle

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:78

The reactive handle returned by `collection.search()` / `rxDB.search()`.

Subscribing to `results$` triggers the query pipeline; call [SearchHandle.destroy](#destroy) to release all internal subscriptions.
The framework bindings (Angular / React / Vue) call `destroy()` automatically at end of life.

## Properties

### error$ \{#error\}

```ts
readonly error$: Observable<
  | SearchExecutionError
  | undefined>;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:84

The most recent execution error; empty queries and queries empty after normalization are not treated as errors

---

### hasMore$ \{#hasmore\}

```ts
readonly hasMore$: Observable<boolean>;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:86

Whether there is another page of results to load

---

### results$ \{#results\}

```ts
readonly results$: Observable<readonly Readonly<SearchResult>[]>;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:80

Reactive read-only snapshot; the array and its elements are frozen at runtime

---

### state$ \{#state\}

```ts
readonly state$: Observable<SearchState>;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:82

The current state (convenient for non-framework scenarios)

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:92

Clears the query term, returns to `idle`, and clears results / error / pagination

#### Returns

`void`

---

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:96

Cancels subscriptions and releases resources (called automatically by the framework layer)

#### Returns

`void`

---

### loadMore() \{#loadmore\}

```ts
loadMore(): Promise<void>;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:90

Loads the next page; no-op when there is no more data

#### Returns

`Promise`&lt;`void`&gt;

---

### retry() \{#retry\}

```ts
retry(): void;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:94

Re-triggers in the `error` state with the last query term

#### Returns

`void`

---

### setQuery() \{#setquery\}

```ts
setQuery(query): void;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:88

Updates the query term (triggers debounce)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `query`   | `string` |

#### Returns

`void`

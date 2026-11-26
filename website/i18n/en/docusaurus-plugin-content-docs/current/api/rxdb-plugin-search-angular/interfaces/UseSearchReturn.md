# UseSearchReturn

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L48)

Return value of [useSearch](../functions/useSearch.md).

## Properties

### clear \{#clear\}

```ts
clear: () => void;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L62)

Clears the query and returns to idle

#### Returns

`void`

---

### error \{#error\}

```ts
readonly error: Signal<
  | SearchExecutionError
  | undefined>;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L56)

The most recent execution error (read-only)

---

### hasMore \{#hasmore\}

```ts
readonly hasMore: Signal<boolean>;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L58)

Whether there is another page (read-only)

---

### loadMore \{#loadmore\}

```ts
loadMore: () => Promise<void>;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L60)

Loads the next page; no-op when there is no more

#### Returns

`Promise`&lt;`void`&gt;

---

### query \{#query\}

```ts
readonly query: WritableSignal<string>;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L50)

Writable signal; writing it triggers the underlying `handle.setQuery` (plugin debounce)

---

### results \{#results\}

```ts
readonly results: Signal<readonly SearchResult[]>;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L52)

The current results (read-only)

---

### retry \{#retry\}

```ts
retry: () => void;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L64)

Retries with the last query term in the error state

#### Returns

`void`

---

### state \{#state\}

```ts
readonly state: Signal<SearchState>;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L54)

The current state (read-only)

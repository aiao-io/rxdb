# CreateSearchHandleOptions

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L47)

SearchHandle factory configuration.

## Properties

### debounceMs? \{#debouncems\}

```ts
readonly debounceMs?: number;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L55)

Debounce (ms), default 300; 0 → pass-through

---

### initialQuery? \{#initialquery\}

```ts
readonly initialQuery?: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L57)

Initial query; triggers one immediate loading

---

### isSearchableQuery? \{#issearchablequery\}

```ts
readonly isSearchableQuery?: (query) => boolean;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L51)

Determines before entering loading whether the query contains any indexable token; false goes straight back to idle.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `query`   | `string` |

#### Returns

`boolean`

---

### performSearch \{#performsearch\}

```ts
readonly performSearch: PerformSearch;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L49)

Underlying search execution

---

### querySource? \{#querysource\}

```ts
readonly querySource?: Observable<string>;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L53)

External query term stream; errors go into [SearchHandle.error$](SearchHandle.md#error), and the handle remains usable imperatively after completion.

---

### refreshAuditMs? \{#refreshauditms\}

```ts
readonly refreshAuditMs?: number;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L72)

Coalescing window (ms) for re-queries on data changes, default 80; `0` → pass through event by event.

#### Remarks

Data changes go through a pass-through channel that bypasses `debounceMs` (this is by design), but **bypassing debounce does not mean no throttling**: one re-query expands into `collections × fields` concurrent `rawQuery` calls, and a bulk import producing hundreds of entity events means thousands of SQL statements flooding the single-threaded sqlite-wasm worker. Multiple changes within the window are coalesced into one re-query.

---

### subscribeDataChanges? \{#subscribedatachanges\}

```ts
readonly subscribeDataChanges?: (onChange) => () => void;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-handle.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-handle.ts#L63)

Subscribes to data source change notifications (entity events). Returns an unbind function.

The implementation should filter so that only collections within the plugin's coverage trigger callbacks; this factory is not aware of specific collections.

#### Parameters

| Parameter  | Type         |
| ---------- | ------------ |
| `onChange` | () => `void` |

#### Returns

() => `void`

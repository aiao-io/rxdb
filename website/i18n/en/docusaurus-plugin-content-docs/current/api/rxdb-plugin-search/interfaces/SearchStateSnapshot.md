# SearchStateSnapshot

Defined in: [packages/rxdb-plugin-search/src/core/search-state.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-state.ts#L10)

Internal snapshot of the state machine (contains all observable derived fields).

## Properties

### error \{#error\}

```ts
error:
  | SearchExecutionError
  | undefined;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-state.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-state.ts#L13)

---

### hasMore \{#hasmore\}

```ts
hasMore: boolean;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-state.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-state.ts#L14)

---

### results \{#results\}

```ts
results: readonly Readonly<SearchResult>[];
```

Defined in: [packages/rxdb-plugin-search/src/core/search-state.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-state.ts#L12)

---

### state \{#state\}

```ts
state: SearchState;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-state.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-state.ts#L11)

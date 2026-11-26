# BoardSearchSourceOptions

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L46)

Optional parameters of the board search source (debounce, in-board page size, change-requery merge window).

## Properties

### debounceMs? \{#debouncems\}

```ts
readonly debounceMs?: number;
```

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L48)

Query debounce (defaults to the engine's 300ms).

---

### pageSize? \{#pagesize\}

```ts
readonly pageSize?: number;
```

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L50)

In-board page size (fixed, the same value in the cross-framework comparison).

---

### refreshAuditMs? \{#refreshauditms\}

```ts
readonly refreshAuditMs?: number;
```

Defined in: [packages/rxdb-plugin-board/src/search/board-search-source.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/search/board-search-source.ts#L52)

Change-requery merge window (defaults to the engine's 80ms).

# SearchState

```ts
type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L53)

The five states of the `SearchHandle` state machine.

- `idle` Empty query (including empty after trim/escaping)
- `loading` Waiting for the first result during debounce / silent re-query / `retry()`
- `success` Has results
- `empty` Query completed but no results
- `error` Execution failed; the last query term and results are retained

Feedback about successful recovery is presented through the framework binding's `aria-live` / toast etc. — **no sixth state is introduced**.

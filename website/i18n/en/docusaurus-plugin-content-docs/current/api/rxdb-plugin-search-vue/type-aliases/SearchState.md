# SearchState

```ts
type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:50

The five states of the `SearchHandle` state machine.

- `idle` empty query (including empty after trim/escaping)
- `loading` waiting for the first result in debounce / silent re-query / `retry()`
- `success` has results
- `empty` query finished with no results
- `error` execution failed; the last query term and results are kept

Feedback for successful recovery is presented via the framework binding's `aria-live` / toast etc.; **no sixth state is introduced**.

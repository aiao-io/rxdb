# createSearchState()

```ts
function createSearchState(): object;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-state.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-state.ts#L59)

Creates a brand-new search state machine.

Implementation notes: pure-function transitions on top of a `BehaviorSubject<SearchStateSnapshot>`. All public transition methods compute the next frame via reduce and push it to subscribers; state$ / `error$` / `hasMore$` are derived via `map + distinctUntilChanged` to avoid duplicate emits.

State machine rules (identical to data-model.md §6):

- Initial `idle`
- `idle → loading`: `beginQuery(non-empty)`
- `loading → success`: `resolveResults(non-empty, hasMore)`
- `loading → empty`: `resolveResults([], _)`
- `loading → error`: `rejectQuery(err)`
- `error → loading`: `retry()`
- Any state + `clear()` → `idle`, clears results/error/hasMore
- Any state + `beginQuery(empty)` → `idle` (**not via loading, not into empty**)

## Returns

### error$

```ts
error$: Observable<SearchExecutionError | undefined>;
```

Derived error stream; undefined on empty query / normal completion

### hasMore$

```ts
hasMore$: Observable<boolean>;
```

Derived hasMore stream

### results$

```ts
results$: Observable<readonly Readonly<SearchResult>[]>;
```

Derived results stream

### snapshot

```ts
snapshot: () => (SearchStateSnapshot = current);
```

The current frame (synchronous read)

#### Returns

[`SearchStateSnapshot`](../interfaces/SearchStateSnapshot.md)

### state$

```ts
state$: Observable<SearchState>;
```

BehaviorSubject-derived stream of the state field; emits the current value immediately upon subscription

### beginQuery()

```ts
beginQuery(query): void;
```

Enters loading; an empty query (empty after trim) short-circuits back to idle and clears all derived fields.

#### Parameters

| Parameter | Type     | Description                                                |
| --------- | -------- | ---------------------------------------------------------- |
| `query`   | `string` | The raw query string (passed in after setQuery → debounce) |

#### Returns

`void`

### clear()

```ts
clear(): void;
```

Clears → `idle`. Releases results/error/hasMore.

#### Returns

`void`

### destroy()

```ts
destroy(): void;
```

Destroys the underlying Subject (releasing GC); behavior of all methods is undefined after destruction, and the caller is responsible for ensuring it is no longer used.

#### Returns

`void`

### rejectQuery()

```ts
rejectQuery(error): void;
```

Query failed; enters `error`, keeps the previous results and hasMore.

#### Parameters

| Parameter | Type                                                         |
| --------- | ------------------------------------------------------------ |
| `error`   | [`SearchExecutionError`](../classes/SearchExecutionError.md) |

#### Returns

`void`

### resolveResults()

```ts
resolveResults(results, hasMore): void;
```

Query settled successfully; empty array → `empty`, otherwise → `success`.

#### Parameters

| Parameter | Type                                                       |
| --------- | ---------------------------------------------------------- |
| `results` | readonly [`SearchResult`](../interfaces/SearchResult.md)[] |
| `hasMore` | `boolean`                                                  |

#### Returns

`void`

### retry()

```ts
retry(): void;
```

In the `error` state, calling `retry()` → back to `loading`, clears the error.
A no-op when called outside the `error` state (defensive; callers outside the state machine should ensure it is not abused).

#### Returns

`void`

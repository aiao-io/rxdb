# useSearch()

```ts
function useSearch(source, options?): UseSearchReturn;
```

Defined in: [packages/rxdb-plugin-search-react/src/use-search.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-react/src/use-search.ts#L90)

Adapts the reactive outputs of a `SearchHandle` into a React hook.

## Parameters

| Parameter  | Type                                                    | Description                                                            |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `source`   | [`SearchSourceLike`](../interfaces/SearchSourceLike.md) | The data source exposing a `search()` method (`RxDB` / `RxCollection`) |
| `options?` | [`SearchOptions`](../interfaces/SearchOptions.md)       | Per-call [SearchOptions](../interfaces/SearchOptions.md)               |

## Returns

[`UseSearchReturn`](../interfaces/UseSearchReturn.md)

## Example

```tsx
const { query, setQuery, results, state } = useSearch(db, { debounce: 200 });
return <input value={query} onChange={e => setQuery(e.target.value)} />;
```

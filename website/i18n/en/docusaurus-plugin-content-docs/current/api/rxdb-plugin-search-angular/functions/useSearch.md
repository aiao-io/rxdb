# useSearch()

```ts
function useSearch(source, options?): UseSearchReturn;
```

Defined in: [packages/rxdb-plugin-search-angular/src/inject-search.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-angular/src/inject-search.ts#L110)

Adapts the reactive outputs of a `SearchHandle` into Angular signals.

Must be called in an injection context (internally calls `inject(DestroyRef)`).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | \| [`SearchSourceLike`](../interfaces/SearchSourceLike.md) \| `Signal`&lt;[`SearchSourceLike`](../interfaces/SearchSourceLike.md)&gt; | The data source exposing a `search()` method (`RxDB` / `RxCollection`);  accepts a plain value or a `Signal`; the handle is rebuilt when the resolved value changes |
| `options?` | \| [`SearchOptions`](../interfaces/SearchOptions.md) \| `Signal`&lt;[`SearchOptions`](../interfaces/SearchOptions.md) \| `undefined`&gt; | Per-call [SearchOptions](../interfaces/SearchOptions.md); accepts a plain value or a `Signal`;  the handle is rebuilt on semantic changes (`collections` / `debounce` / `pageSize` / `snippetLength`) |

## Returns

[`UseSearchReturn`](../interfaces/UseSearchReturn.md)

## Example

```ts
readonly search = useSearch(this.db, { debounce: 200 });
readonly results = this.search.results;
onInput(e: Event) `{ this.search.query.set((e.target as HTMLInputElement).value); }`
```

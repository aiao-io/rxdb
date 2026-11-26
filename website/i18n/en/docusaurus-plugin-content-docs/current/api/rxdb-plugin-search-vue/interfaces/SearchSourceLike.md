# SearchSourceLike

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:106

The minimal data source shape exposing a `search()` method (`RxDB` / `RxCollection`).

All three framework binding layers (Angular / React / Vue) share this constraint to avoid drift from duplicate declarations.
`query` only accepts `string`: Observable inputs are bridged by the caller inside the source.

## Methods

### search() \{#search\}

```ts
search(query, options?): SearchHandle;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:107

#### Parameters

| Parameter  | Type                                |
| ---------- | ----------------------------------- |
| `query`    | `string`                            |
| `options?` | [`SearchOptions`](SearchOptions.md) |

#### Returns

[`SearchHandle`](SearchHandle.md)

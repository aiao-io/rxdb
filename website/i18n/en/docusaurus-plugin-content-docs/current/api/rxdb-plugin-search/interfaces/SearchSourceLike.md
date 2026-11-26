# SearchSourceLike

Defined in: [packages/rxdb-plugin-search/src/types.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L112)

The minimal data-source shape (`RxDB` / `RxCollection`) that exposes a `search()` method.

The three framework bindings (Angular / React / Vue) share this constraint to avoid duplicate declarations drifting apart. `query` accepts only `string`: Observable inputs are bridged by the caller inside the source.

## Methods

### search() \{#search\}

```ts
search(query, options?): SearchHandle;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L113)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `options?` | [`SearchOptions`](SearchOptions.md) |

#### Returns

[`SearchHandle`](SearchHandle.md)

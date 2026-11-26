# searchOptionsEqual()

```ts
function searchOptionsEqual(left, right): boolean;
```

Defined in: [packages/rxdb-plugin-search/src/core/options-equality.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/options-equality.ts#L53)

Determines whether two [SearchOptions](../interfaces/SearchOptions.md) are equivalent **in the sense of rebuilding a `SearchHandle`**.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `left` | [`SearchOptions`](../interfaces/SearchOptions.md) \| `undefined` | The options in effect last time; `undefined` means not passed |
| `right` | [`SearchOptions`](../interfaces/SearchOptions.md) \| `undefined` | The options passed this time; `undefined` means not passed |

## Returns

`boolean`

`true` when the two are equivalent (no rebuild needed)

## Remarks

`collections` is compared item-by-item in an **order-sensitive** way: it determines the FTS aggregation scope and the input to result ordering, so a different order counts as a different scope — no normalization to set semantics.

**`initialQuery` is deliberately excluded from the comparison.**
The binding layer's contract is "keep the user's current query on rebuild"; `initialQuery` only serves as a seed at first creation, and every later rebuild overwrites it with the current query — it has no effect on the rebuild result. If it took part in the comparison, a caller passing `initialQuery: query` to seed a new handle would **trigger a rebuild on every keystroke**, breaking debounce and pagination entirely.
See SRCHR-001 / SRCHV-004 / SRA-008.

# normalizeManualOrderBy()

```ts
function normalizeManualOrderBy<O>(metadata, options): O;
```

Defined in: [packages/rxdb/src/sortable/sortable.utils.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.utils.ts#L77)

Adds the default ordering to queries against manually ordered entities.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-o"></a> `O` *extends* `object` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | `Pick`&lt;[`EntityMetadata`](../type-aliases/EntityMetadata.md), `"manualOrder"`&gt; | The entity metadata |
| `options` | `O` | The caller's query options, never rewritten |

## Returns

`O`

When no `orderBy` is given (or an empty array is given), a new object padded to `[grouping fields… asc, sortOrder asc, id asc]`;
  otherwise returned unchanged

## Remarks

Ordering given explicitly by the caller is respected as-is — never appended to, never rewritten. An empty array is treated as "not given": it expresses "order does not matter",
but a live query's incremental merge only re-sorts when `orderBy` is non-empty, so leaving it empty would keep a dragged list from reordering.
Grouping fields come first, so rows of the same group stay contiguous; the NULL group sorts first in both SQL backends and in-memory comparison.
The returned object must be handed to both the runner and `createTask` — the cache key and the merge options both need the normalized copy.

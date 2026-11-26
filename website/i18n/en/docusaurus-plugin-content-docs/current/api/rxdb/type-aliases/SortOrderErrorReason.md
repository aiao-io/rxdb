# SortOrderErrorReason

```ts
type SortOrderErrorReason =
  | 'notManualOrder'
  | 'invalidKey'
  | 'corruptAnchor'
  | 'unsupportedPrimary'
  | 'invalidTarget'
  | 'notFound'
  | 'staleTarget';
```

Defined in: [packages/rxdb/src/sortable/sortable-error.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable-error.ts#L15)

Classification of [SortOrderError](../classes/SortOrderError.md)

- `'notManualOrder'`: the entity does not declare `manualOrder: true`, yet a reorder was called
- `'invalidKey'`: a sort key written explicitly by the user is invalid
- `'corruptAnchor'`: a key read from the database as an anchor (tail key / neighbor) is invalid, or the two neighbors do not satisfy `prev < next`
- `'unsupportedPrimary'`: the primary side is remote-only or QueryCache, so the full sequence cannot be read
- `'invalidTarget'`: the reorder target itself does not hold (both neighbors are empty, a neighbor is the moved row itself, the keys of `group` / `expectedGroup` do not match the grouping fields, or `group` is mixed with neighbor target fields)
- `'notFound'`: the row being moved no longer exists
- `'staleTarget'`: a neighbor no longer exists, is no longer adjacent, is not in the same group, or is no longer in `expectedGroup` — the order the caller saw is stale and should be re-queried

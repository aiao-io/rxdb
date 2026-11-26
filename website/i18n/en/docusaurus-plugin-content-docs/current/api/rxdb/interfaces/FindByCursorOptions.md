---
sidebar_label: 'FindByCursorOptions⟨T, U, W⟩'
---

# FindByCursorOptions`<T, U, W>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L116)

FindByCursor query options

## Type Parameters

| Type Parameter                                                                            | Default type                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md)                                |
| <a id="type-parameter-u"></a> `U`                                                         | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`InstanceType`&lt;`T`&gt;&gt; |
| <a id="type-parameter-w"></a> `W` _extends_ `string`                                      | `string`                                                                     |

## Properties

### after? \{#after\}

```ts
after?: InstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L144)

Fetches entities after this entity

---

### before? \{#before\}

```ts
before?: InstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L139)

Fetches entities before this entity

---

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L169)

How many rows to fetch

#### Remarks

Only constrains the **initial** result (≤ limit). Afterwards this page is a live query whose count and boundary rows change with changes, depending on which merge path is taken:

- **JS incremental merge for CREATE** (the normal path): no existing row is trimmed. When the page is full, new rows landing inside the window grow the page past
  the limit and the boundary rows stay put, while new rows outside the boundary rows belong to adjacent pages and are trimmed as usual; when the page is not full, new rows first fill up to the limit,
  and the boundary rows may move outward.
- **Re-querying SQL** (UPDATE hitting a row in the page, making a row newly satisfy the where or changing its ordering key; CREATE / DELETE hitting a relation
  where; CREATE events older than the entity cache): the whole page is re-trimmed by limit, rows that only grew in incrementally are trimmed accordingly, departed rows
  are filled in by later ones, and the boundary rows may move inward or outward.
- **JS filtering for DELETE** (the normal path): deleted rows are filtered out without backfilling, so the page may be shorter than limit —
  "count \< limit" does not imply "there is no more data".

Adjacent pages are not affected: each page anchors on its `after` / `before` row (every SQL re-query cuts the window by this row's currently persisted
ordering key, and if the anchor row's ordering key changes, the window follows it), so whether this page grows or shrinks, the next page's starting point stays put.
Conversely, consumers of chained pagination must re-open the adjacent page with the new boundary row whenever this page's **boundary row** (the page tail for an `after` chain, the page
head for a `before` chain) changes to a different row, otherwise rows between the old and new boundaries would be missed or duplicated.
The three frameworks' `useInfiniteScroll` / `InfiniteScrollingList` all re-anchor this way.

#### Default

```ts
100;
```

---

### orderBy \{#orderby\}

```ts
orderBy: (OrderBy < W) > [];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L134)

Ordering conditions
Cursor queries must include an ordering by a unique value, e.g. id as the last ordering parameter, otherwise the cursor cannot be located

#### Example

```ts
orderBy: [
  { field: 'createdAt', sort: 'DESC' },
  { field: 'id', sort: 'ASC' } // must include an ordering by a unique value
];
```

---

### where \{#where\}

```ts
where: U;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L121)

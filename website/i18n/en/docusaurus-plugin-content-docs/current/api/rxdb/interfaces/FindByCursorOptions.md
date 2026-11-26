---
sidebar_label: "FindByCursorOptions⟨T, U, W⟩"
---

# FindByCursorOptions`<T, U, W>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L116)

FindByCursor query options.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |
| <a id="type-parameter-u"></a> `U` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`InstanceType`&lt;`T`&gt;&gt; |
| <a id="type-parameter-w"></a> `W` *extends* `string` | `string` |

## Properties

### after? \{#after\}

```ts
after?: InstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L144)

Fetches the entities after this entity.

***

### before? \{#before\}

```ts
before?: InstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L139)

Fetches the entities before this entity.

***

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L169)

How many rows to fetch.

#### Remarks

Only constrains the **first** result (≤ limit). Afterwards this page is a live query, and its size and boundary
rows change with changes — depending on which merge path is taken:

- **JS incremental merge for CREATE** (the normal path): not one existing row is trimmed. When the page is
  full, a new row landing in the window grows the page past limit with the boundary rows unchanged, while a
  new row falling outside the boundary rows belongs to an adjacent page and is trimmed as usual; when the page
  is not full, new rows first fill up to limit, and the boundary row may move outward.
- **Re-querying SQL** (UPDATE hitting a row inside the page, making a row newly satisfy the where or changing
  the ordering key; CREATE / DELETE hitting a relation where; a CREATE event older than the entity cache): the
  whole page is re-trimmed to limit — rows that only grew in incrementally are trimmed along, and rows that
  left are replaced by the ones after; the boundary row may move inward or outward.
- **JS filtering for DELETE** (the normal path): the deleted row is simply filtered out without refilling, so
  the page may be shorter than limit — "count \< limit" does not imply "there is no more data".

Adjacent pages are not affected: each page is anchored to the `after` / `before` row (every SQL re-query cuts
the window by the persisted ordering key of this row at that moment; if the anchor row's ordering key changes,
the window follows it), so whether this page grows or shrinks, the next page's starting point does not move.
Conversely, consumers of chained pagination must reopen the adjacent page with the new boundary row when this
page's **boundary row** (the page tail for the `after` chain, the page head for the `before` chain) changes to
a different row, otherwise rows between the old and new boundaries are missed or duplicated. The
`useInfiniteScroll` / `InfiniteScrollingList` of all three frameworks re-anchor this way.

#### Default

```ts
100
```

***

### orderBy \{#orderby\}

```ts
orderBy: OrderBy<W>[];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L134)

Ordering conditions.
Cursor queries must include ordering by a unique value — for example: id as the last ordering parameter —
otherwise the cursor cannot be located.

#### Example

```ts
orderBy: [
  { field: 'createdAt', sort: 'DESC' },
  { field: 'id', sort: 'ASC' } // must include ordering by a unique value
]
```

***

### where \{#where\}

```ts
where: U;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L121)

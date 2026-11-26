---
sidebar_label: "InfiniteScrollingList⟨T⟩"
---

# InfiniteScrollingList`<T>`

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L99)

An infinite scrolling list based on cursor pagination.

## Remarks

**Must be constructed in an injection context** — it registers a destruction hook via `inject(DestroyRef)` internally and unsubscribes all page queries automatically when the host is destroyed.

Each page is maintained as an independent live query subscription; `value` is the result of merging the pages in order. Underlying data changes make the corresponding page re-emit automatically.

For a more idiomatic Angular entry point, see [useInfiniteScroll](../functions/useInfiniteScroll.md) (returns a signal resource, same name and shape as `useInfiniteScroll` on the React/Vue side) (RAN-015).

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) | Entity constructor type |

## Constructors

### Constructor

```ts
new InfiniteScrollingList<T>(
   rxdb, 
   EntityType, 
   options
): InfiniteScrollingList<T>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L138)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | RxDB instance |
| `EntityType` | `T` | Entity constructor |
| `options` | [`InfiniteScrollOptions`](../type-aliases/InfiniteScrollOptions.md)&lt;`T`&gt; | Cursor pagination options; when a function is passed it is a reactive reader, and option changes reset and reload automatically |

#### Returns

`InfiniteScrollingList`&lt;`T`&gt;

## Properties

### error \{#error\}

```ts
readonly error: Signal<Error | undefined>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L119)

The most recent load error; cleared by the next successful load.

***

### hasMore \{#hasmore\}

```ts
readonly hasMore: Signal<boolean>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L123)

Whether a next page may still exist; set to `false` once a page returns fewer than `limit` entries.

***

### hasValue \{#hasvalue\}

```ts
readonly hasValue: Signal<boolean>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L127)

Whether there is any data (unlike [isEmpty](#isempty), does not consider loading/error states).

***

### isEmpty \{#isempty\}

```ts
readonly isEmpty: Signal<boolean>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L129)

***

### isLoading \{#isloading\}

```ts
readonly isLoading: Signal<boolean>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L121)

Whether a new page is currently being loaded.

***

### value \{#value\}

```ts
readonly value: Signal<InstanceType<T>[]>;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L125)

Entities from the loaded pages merged in order.

## Methods

### loadMore() \{#loadmore\}

```ts
loadMore(): void;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L173)

Loads the next page.

#### Returns

`void`

#### Remarks

No-op while `isLoading` is true or `hasMore` is false — repeated calls never produce concurrent requests.

RAN-002: the method body is wrapped entirely in untracked. It reads `isLoading` / `hasMore` / the reactive `options` / `#values` and then writes back to the same batch of signals; without isolation, a caller invoking it once inside an `effect` on its own trigger would register all of these internal signals as dependencies of that effect — a page `next` setting `isLoading` back to false would wake the effect and immediately request the next page, paging all the way to the end without the trigger ever changing again. With isolation, only the caller's own declared dependencies participate in triggering.

***

### refresh() \{#refresh\}

```ts
refresh(): void;
```

Defined in: [rxdb-angular/src/InfiniteScrollingList.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/InfiniteScrollingList.ts#L200)

Discards all loaded pages and reloads from the first page.

#### Returns

`void`

#### Remarks

Unsubscribes all in-flight page queries; `error` and `hasMore` are reset as well. A complete no-op once the host injector is destroyed.

Runs in untracked like [loadMore](#loadmore); see that method for the reason (RAN-002).

RAN-012: the `destroyed` guard must come **before** `#resetState()` — with the guard only in `loadMore`, a refresh after destruction would first empty `#values` and then leave loadMore spinning, showing the user an empty list that never comes back. Aligns with the React side (`if (!mountedRef.current) return;` in `rxdb-react/src/useInfiniteScroll.ts`).

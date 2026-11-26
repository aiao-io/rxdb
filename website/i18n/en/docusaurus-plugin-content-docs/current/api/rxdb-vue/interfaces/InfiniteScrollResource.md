---
sidebar_label: "InfiniteScrollResource⟨T⟩"
---

# InfiniteScrollResource`<T>`

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L84)

Infinite scroll resource.

## Remarks

RAN-014: the state fields are all `ComputedRef`s, not writable `Ref`s — earlier, `isLoading` / `error` / `hasMore` exposed the internal `ref`s directly, so a caller's single line of `resource.isLoading.value = false` could make the state machine disagree with the actual subscription, and the next `loadMore` would overwrite it back without warning. The three frameworks' semantics were aligned accordingly: Angular uses `asReadonly()` (RAN-009), React returns values directly.

Unlike the basic hooks' [RxDBResource](RxDBResource.md), here every field is itself a `ComputedRef`, so **destructuring is safe** (`const { value, loadMore } = useInfiniteScroll(...)`).

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | Entity instance type. |

## Properties

### error \{#error\}

```ts
error: ComputedRef<Error | undefined>;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L102)

The most recent failure's error, passing through the underlying `Error` as-is (non-`Error` payloads are wrapped into real `Error`s). Cleared at the entry of every `loadMore` / `refresh`.

***

### hasMore \{#hasmore\}

```ts
hasMore: ComputedRef<boolean>;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L107)

Whether another page is possibly available. Decided by the **last page**: `true` when that page is full. Always `false` when the page capacity is non-positive (`limit <= 0` or `NaN`); a stream that completes without any next also converges to `false`.

***

### isEmpty \{#isempty\}

```ts
isEmpty: ComputedRef<boolean>;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L93)

Whether it is "loading done and there really is no data": mounted, database ready, no error, empty list and not loading. Always `false` on error or while loading, so it is never true at the same time as `error`.

***

### isLoading \{#isloading\}

```ts
isLoading: ComputedRef<boolean>;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L97)

Whether a user-initiated load is in progress. Self-healing re-anchoring of live queries (see RVU-004) does not count.

***

### loadMore \{#loadmore\}

```ts
loadMore: () => void;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L112)

Loads the next page using the current last entity as the cursor. A no-op while loading, when there is no next page, before mount, or when the database is not ready — safe to use for automatic bottom-hitting.

#### Returns

`void`

***

### refresh \{#refresh\}

```ts
refresh: () => void;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L116)

Discards all pages and subscriptions and restarts loading from the first page. A no-op before mount.

#### Returns

`void`

***

### value \{#value\}

```ts
value: ComputedRef<T[]>;
```

Defined in: [rxdb-vue/src/useInfiniteScroll.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/useInfiniteScroll.ts#L88)

The entity list concatenated from all loaded pages; each entity is processed with `markRaw` and will not be recursively proxied by Vue.

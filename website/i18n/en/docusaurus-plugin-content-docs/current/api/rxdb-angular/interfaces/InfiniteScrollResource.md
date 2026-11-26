---
sidebar_label: "InfiniteScrollResource⟨T⟩"
---

# InfiniteScrollResource`<T>`

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L20)

Angular infinite scroll resource.

## Remarks

Field semantics are aligned item by item with the React side's `InfiniteScrollResource` (`@aiao/rxdb-react`); the only difference is that every field here is a Signal — same feature, same API across all three frameworks (RAN-015).

RAN-009: `isLoading` / `error` / `hasMore` were previously declared as `WritableSignal`, exposing the internal state machine's write entry points to consumers — writing `false` into `isLoading` externally bypasses `loadMore`'s concurrency guard, and writing `true` into `hasMore` skips the final page. They are now narrowed to read-only `Signal`; state can only change through `loadMore` / `refresh`, symmetric with the "returns plain values" read-only semantics on the React side.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Properties

### error \{#error\}

```ts
readonly error: Signal<Error | undefined>;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L28)

The most recent load error; cleared by the next successful load.

***

### hasMore \{#hasmore\}

```ts
readonly hasMore: Signal<boolean>;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L30)

Whether a next page may still exist. Set to `false` once a page returns fewer than a full page.

***

### isEmpty \{#isempty\}

```ts
readonly isEmpty: Signal<boolean>;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L24)

The first load has completed and the result is empty. Always `false` before the first load completes.

***

### isLoading \{#isloading\}

```ts
readonly isLoading: Signal<boolean>;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L26)

Whether a new page is currently being loaded.

***

### loadMore \{#loadmore\}

```ts
readonly loadMore: () => void;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L32)

Loads the next page. No-op while `isLoading` is true or `hasMore` is false.

#### Returns

`void`

***

### refresh \{#refresh\}

```ts
readonly refresh: () => void;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L34)

Clears the current pages and reloads the first page.

#### Returns

`void`

***

### value \{#value\}

```ts
readonly value: Signal<T[]>;
```

Defined in: [rxdb-angular/src/use-infinite-scroll.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-infinite-scroll.ts#L22)

Entities from the loaded pages merged together.

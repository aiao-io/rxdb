---
sidebar_label: "InfiniteScrollResource⟨T⟩"
---

# InfiniteScrollResource`<T>`

Defined in: [rxdb-react/src/useInfiniteScroll.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L88)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Properties

### error \{#error\}

```ts
readonly error: Error | undefined;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L96)

The most recent load error.

***

### hasMore \{#hasmore\}

```ts
readonly hasMore: boolean;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L98)

Whether a next page may still exist.

***

### isEmpty \{#isempty\}

```ts
readonly isEmpty: boolean;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L92)

The first load has completed and the result is empty.

***

### isLoading \{#isloading\}

```ts
readonly isLoading: boolean;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L94)

Whether a new page is currently being loaded.

***

### loadMore \{#loadmore\}

```ts
readonly loadMore: () => void;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L100)

Loads the next page.

#### Returns

`void`

***

### refresh \{#refresh\}

```ts
readonly refresh: () => void;
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L102)

Clears the current pages and reloads the first page.

#### Returns

`void`

***

### value \{#value\}

```ts
readonly value: T[];
```

Defined in: [rxdb-react/src/useInfiniteScroll.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/useInfiniteScroll.ts#L90)

Entities from all loaded pages merged together.

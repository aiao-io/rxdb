---
sidebar_label: "RxDBResource⟨T⟩"
---

# RxDBResource`<T>`

Defined in: [rxdb-react/src/hooks.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L27)

Resource snapshot returned by the React query hooks for the current render.

## Remarks

| Phase | isLoading | hasValue | isEmpty | error | value |
| --- | --- | --- | --- | --- | --- |
| Before first subscription | `true` | `false` | `undefined` | `undefined` | `defaultValue` |
| Data received | `false` | `true` | whether empty | `undefined` | new value |
| Query criteria changed | `true` | `false` | `undefined` | `undefined` | last successful value |
| Entity or method changed | `true` | `false` | `undefined` | `undefined` | `defaultValue` of the new type |
| Error | `false` | `false` | `undefined` | error | last successful value |
| Completed without a value | `false` | `false` | `undefined` | `undefined` | current value |

Query criteria changes use stale-while-revalidate: `value` is kept temporarily, but `hasValue` flips to `false` synchronously, so the old value is never claimed to belong to the new query. The resource is a plain read-only snapshot for each render and can be destructured directly.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | Query result type. |

## Properties

### error \{#error\}

```ts
readonly error: Error | undefined;
```

Defined in: [rxdb-react/src/hooks.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L31)

The most recent query error.

***

### hasValue \{#hasvalue\}

```ts
readonly hasValue: boolean;
```

Defined in: [rxdb-react/src/hooks.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L37)

Whether the current query has produced a successful value.

***

### isEmpty \{#isempty\}

```ts
readonly isEmpty: boolean | undefined;
```

Defined in: [rxdb-react/src/hooks.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L35)

Whether the successful result is empty; `undefined` while loading or on error.

***

### isLoading \{#isloading\}

```ts
readonly isLoading: boolean;
```

Defined in: [rxdb-react/src/hooks.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L33)

Whether the current query is still waiting for a result.

***

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [rxdb-react/src/hooks.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L29)

Current value; the last successful value is kept when the query fails.

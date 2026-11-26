---
sidebar_label: "RxDBProviderSet⟨T⟩"
---

# RxDBProviderSet`<T>`

Defined in: [rxdb-react/src/rxdb-react.tsx:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L58)

A set of mutually isolated RxDB Providers and read hooks.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Properties

### RxDBProvider \{#rxdbprovider\}

```ts
RxDBProvider: RxDBProviderType<T>;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L60)

Provider component sharing a context with `useRxDB`.

***

### useHasRxDBProvider \{#usehasrxdbprovider\}

```ts
useHasRxDBProvider: () => boolean;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L66)

Whether this set's Provider exists in the component tree; independent of whether the database is ready or failed to create.

#### Returns

`boolean`

***

### useRxDB \{#userxdb\}

```ts
useRxDB: UseRxDB<T>;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L62)

Reads the database instance passed explicitly or from context; throws when it is not ready.

***

### useRxDBOptional \{#userxdboptional\}

```ts
useRxDBOptional: UseRxDBOptional<T>;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L64)

Reads the database instance passed explicitly or from context; returns `undefined` when it is not ready.

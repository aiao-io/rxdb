---
sidebar_label: "ProviderProps⟨T⟩"
---

# ProviderProps`<T>`

Defined in: [rxdb-react/src/rxdb-react.tsx:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L41)

Props of [RxDBProvider](../variables/RxDBProvider.md).

## Remarks

RRE-008: `db` is **required**. It was previously declared optional, so `<RxDBProvider>` compiled fine while the subtree only threw at runtime inside `useRxDB()` — and the error message suggested "use RxDBProvider", pointing users in the wrong direction even though they were already using the Provider.

This still holds after async readiness support: what was relaxed is the **value** of `db` (it may be a Promise or a factory), not its **requiredness**. "A Provider exists but is not ready yet" is expressed by [useRxDBOptional](../variables/useRxDBOptional.md).

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Properties

### children? \{#children\}

```ts
children?: ReactNode;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L43)

Provider subtree; renders an empty node when not provided.

***

### db \{#db\}

```ts
db: RxDBSource<T>;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L45)

Database instance, a Promise, or a factory returning either.

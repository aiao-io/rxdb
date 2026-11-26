---
sidebar_label: 'UseRxDBOptional⟨T⟩'
---

# UseRxDBOptional`<T>`

```ts
type UseRxDBOptional<T> = (db?) => T | undefined;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L55)

Hook type that reads RxDB from an explicit parameter or the nearest Provider; returns `undefined` when not ready.

## Type Parameters

| Type Parameter                                                                   |
| -------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`RxDB`](../../rxdb/classes/RxDB.md) |

## Parameters

| Parameter | Type |
| --------- | ---- |
| `db?`     | `T`  |

## Returns

`T` \| `undefined`
